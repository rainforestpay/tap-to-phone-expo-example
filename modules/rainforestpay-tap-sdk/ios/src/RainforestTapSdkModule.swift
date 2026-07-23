import CoreLocation
import ExpoModulesCore
import ProximityReader
import RainforestSDK

enum RainforestTapSdkError: LocalizedError {
  case message(String)

  var errorDescription: String? {
    switch self {
    case .message(let message):
      return message
    }
  }
}

class LocationPermissionDelegate: NSObject, CLLocationManagerDelegate {
  private var onStatusChange: ((CLAuthorizationStatus) -> Void)?

  init(onStatusChange: @escaping (CLAuthorizationStatus) -> Void) {
    self.onStatusChange = onStatusChange
  }

  func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
    onStatusChange?(status)

    switch status {
    case .authorizedAlways, .authorizedWhenInUse, .denied, .restricted:
      onStatusChange = nil
    default:
      break
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    locationManager(manager, didChangeAuthorization: manager.authorizationStatus)
  }
}

public class RainforestTapSdkModule: Module {
  private var ttp: TapToPhoneCoreProtocol?
  private var sessionKey: String?
  private var environment: Environment = .sandbox
  private var sdkListenerTask: Task<Void, Never>?
  private var deviceRegistrationId: String?

  private let locationManager = CLLocationManager()
  private var permissionPromise: Promise?
  private var locationDelegate: LocationPermissionDelegate?

  public func definition() -> ModuleDefinition {
    Name("RainforestTapSdk")

    Events("onSdkEvent")

    // One-time setup (permissions and merchant terms), then auto mode, which owns prepare and
    // resume from here on.
    AsyncFunction("initialize") { (sessionKey: String, environment: String, deviceRegistrationId: String) async throws in
      let resolvedEnvironment = Environment.fromString(environment)

      do {
        _ = try await RainforestPay.setupTapToPhone(
          environment: resolvedEnvironment, sessionKey: sessionKey, deviceRegistrationId: deviceRegistrationId)

        self.sessionKey = sessionKey
        self.environment = resolvedEnvironment
        self.deviceRegistrationId = deviceRegistrationId

        self.ttp = try await RainforestPay.TapToPhoneAuto(
          environment: resolvedEnvironment, sessionKey: sessionKey, deviceRegistrationId: deviceRegistrationId)
        self.sdkListenerTask?.cancel()
        self.sdkListenerTask = Task {
          await self.startSdkListener()
        }
      } catch let sdkError as RainforestError {
        throw RainforestTapSdkError.message(sdkError.localizedDescription)
      } catch {
        throw RainforestTapSdkError.message("Tap SDK failed to initialize")
      }
    }

    Function("getSdkVersion") {
      RainforestPay.version()
    }

    Function("getInfo") {
      [
        "sessionKey": self.sessionKey ?? "",
        "debug": false,
      ]
    }

    Function("isTapSdkReady") {
      self.ttp != nil
    }

    AsyncFunction("hasLocationPermission") { (promise: Promise) in
      self.permissionPromise = promise

      switch self.locationManager.authorizationStatus {
      case .notDetermined:
        self.requestLocationPermission()
      case .authorizedWhenInUse, .authorizedAlways:
        promise.resolve(true)
      case .denied, .restricted:
        promise.resolve(false)
      @unknown default:
        promise.reject("ERR_LOCATION_STATUS", "Unknown authorization status")
      }
    }

    AsyncFunction("hasBluetoothPermission") { (promise: Promise) in
      promise.resolve(true)
    }

    AsyncFunction("createPayinConfig") { (merchantId: String, amountCents: Int) async throws -> String in
      guard let sessionKey = self.sessionKey else {
        throw RainforestTapSdkError.message("session key missing")
      }
      guard !merchantId.isEmpty else {
        throw RainforestTapSdkError.message("merchant ID missing")
      }

      do {
        let payinConfig = try await RainforestPay.API(self.environment).createPayinConfig(
          sessionKey: sessionKey,
          merchantId: merchantId,
          amount: amountCents
        )

        guard let payinConfigId = payinConfig?.payinConfigId, !payinConfigId.isEmpty else {
          throw RainforestTapSdkError.message("Unable to create payin config: missing response data")
        }

        return payinConfigId
      } catch let sdkError as RainforestError {
        throw RainforestTapSdkError.message(sdkError.localizedDescription)
      } catch let bridgeError as RainforestTapSdkError {
        throw bridgeError
      } catch {
        throw RainforestTapSdkError.message("Unable to create payin config")
      }
    }

    AsyncFunction("present") { (payinConfigId: String) async throws -> String in
      guard let ttp = self.ttp else {
        throw RainforestTapSdkError.message("Tap SDK is not ready")
      }

      do {
        let response = try await ttp.presentPayin(payinConfigId: payinConfigId)
        return response.isSuccess ? "success" : response.status.description
      } catch let sdkError as RainforestError {
        throw RainforestTapSdkError.message(sdkError.localizedDescription)
      } catch {
        throw RainforestTapSdkError.message("Tap SDK failed to present")
      }
    }

    AsyncFunction("cancelPresented") { () async throws -> String in
      guard let ttp = self.ttp else {
        throw RainforestTapSdkError.message("Tap SDK is not ready")
      }

      do {
        try await ttp.cancelPresented()
        return "success"
      } catch let sdkError as RainforestError {
        throw RainforestTapSdkError.message(sdkError.localizedDescription)
      } catch {
        throw RainforestTapSdkError.message("Tap SDK failed to cancel")
      }
    }

    AsyncFunction("teardown") { () async -> String in
      self.sdkListenerTask?.cancel()
      self.sdkListenerTask = nil
      await self.ttp?.teardown()
      self.ttp = nil
      self.sessionKey = nil
      self.deviceRegistrationId = nil
      return "success"
    }
  }

  private func requestLocationPermission() {
    self.locationDelegate = LocationPermissionDelegate { [weak self] status in
      guard let self = self, let promise = self.permissionPromise else { return }

      switch status {
      case .authorizedAlways, .authorizedWhenInUse:
        promise.resolve(true)
      case .denied, .restricted:
        promise.resolve(false)
      default:
        break
      }

      self.permissionPromise = nil
      self.locationDelegate = nil
    }

    self.locationManager.delegate = self.locationDelegate
    self.locationManager.requestWhenInUseAuthorization()
  }

  private func startSdkListener() async {
    guard let ttp = self.ttp else {
      return
    }

    for await sdkEvent in await ttp.eventStream() {
      if Task.isCancelled {
        return
      }

      let eventData: [String: Any]
      switch sdkEvent {
      case .customEvent(let innerEvent):
        eventData = mapCustomEvent(innerEvent)
      case .readerEvent(let innerEvent):
        eventData = mapReaderEvent(innerEvent)
      default:
        eventData = ["type": "unknown", "payload": String(describing: sdkEvent)]
      }

      self.sendEvent("onSdkEvent", eventData)
    }
  }

  private func mapCustomEvent(_ event: RainforestEvent) -> [String: Any] {
    switch event {
    case .approved:
      return ["type": "approved"]
    case .attempted:
      return ["type": "attempted"]
    case .canceled:
      return ["type": "canceled"]
    case .declined:
      return ["type": "declined"]
    case .inProgress:
      return ["type": "inProgress"]
    case .preparing:
      return ["type": "preparing"]
    case .readerNotReady(let reason):
      return ["type": "readerNotReady", "payload": reason]
    case .ready:
      return ["type": "ready"]
    case .configured:
      return ["type": "configured"]
    case .invalidSessionKey:
      return ["type": "invalidSessionKey"]
    case .prepareSucceeded:
      return ["type": "prepareSucceeded"]
    case .prepareFailed(let reason):
      return ["type": "prepareFailed", "payload": reason]
    case .updateReaderProgress(let progress):
      return ["type": "updateReaderProgress", "value": progress]
    default:
      return ["type": "unknown", "payload": String(describing: event)]
    }
  }

  private func mapReaderEvent(_ event: PaymentCardReader.Event) -> [String: Any] {
    switch event {
    case .cardDetected:
      return ["type": "cardDetected"]
    case .notReady:
      return ["type": "notReady"]
    case .pinEntryCompleted:
      return ["type": "pinEntryCompleted"]
    case .pinEntryRequested:
      return ["type": "pinEntryRequested"]
    case .readCancelled:
      return ["type": "readCancelled"]
    case .readCompleted:
      return ["type": "readCompleted"]
    case .readNotCompleted:
      return ["type": "readNotCompleted"]
    case .readRetry:
      return ["type": "readRetry"]
    case .readyForTap:
      return ["type": "readyForTap"]
    case .removeCard:
      return ["type": "removeCard"]
    case .updateProgress(let progress):
      return ["type": "updateReaderProgress", "value": progress]
    case .userInterfaceDismissed:
      return ["type": "userInterfaceDismissed"]
    default:
      return ["type": "unknown", "payload": String(describing: event)]
    }
  }
}
