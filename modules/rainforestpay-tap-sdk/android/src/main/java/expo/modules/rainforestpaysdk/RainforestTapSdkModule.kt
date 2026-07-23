package expo.modules.rainforestpaysdk

import android.Manifest
import android.os.Build
import android.util.Log
import com.rainforestpay.sdk.Environment
import com.rainforestpay.sdk.RainforestPay
import com.rainforestpay.sdk.api.PayinConfigCreateRequest
import com.rainforestpay.sdk.tap.TapToPhoneAuto
import com.rainforestpay.sdk.tap.TapToPhoneAutoEvent
import com.rainforestpay.sdk.tap.TapToPhoneInterface
import com.rainforestpay.sdk.tap.TtpEvent
import expo.modules.interfaces.permissions.Permissions
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import kotlin.coroutines.resume
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

class RainforestTapSdkModule : Module() {
  private var tapToPhone: TapToPhoneInterface? = null
  private var sessionKey: String? = null
  private var environment: Environment = Environment.SANDBOX
  private var deviceRegistrationId: String? = null
  private val moduleScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
  private var listenerJob: Job? = null
  private var lifecycleJob: Job? = null

  override fun definition() = ModuleDefinition {
    Name("RainforestTapSdk")
    Events("onSdkEvent")

    // One-time setup (permissions and merchant terms), then auto mode, which owns prepare and
    // resume from here on.
    AsyncFunction("initialize") Coroutine { sessionKey: String, envString: String, deviceRegistrationId: String ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is not available")

      if (!ensureRuntimePermissions()) {
        throw IllegalStateException("required permissions were not granted")
      }

      val environment = mapEnvironment(envString)
      withContext(Dispatchers.IO) {
        RainforestPay.setupTapToPhone(context, environment, sessionKey, deviceRegistrationId)
      }

      this@RainforestTapSdkModule.sessionKey = sessionKey
      this@RainforestTapSdkModule.environment = environment
      this@RainforestTapSdkModule.deviceRegistrationId = deviceRegistrationId
      this@RainforestTapSdkModule.tapToPhone = RainforestPay.tapToPhoneAuto(
        context,
        environment,
        sessionKey,
        deviceRegistrationId
      )
      startSdkListener()
    }

    Function("getSdkVersion") {
      RainforestPay.getVersion()
    }

    Function("getInfo") {
      val ttp = this@RainforestTapSdkModule.tapToPhone
        ?: throw IllegalStateException("Tap to Phone is not initialized")
      val info = ttp.info()
      return@Function mapOf(
        "sessionKey" to info.sessionKey,
        "debug" to info.debug
      )
    }

    Function("isTapSdkReady") {
      tapToPhone != null
    }

    AsyncFunction("hasLocationPermission") { promise: Promise ->
      val permissions = appContext.permissions
        ?: throw IllegalStateException("Permissions module is not available")
      val permission = Manifest.permission.ACCESS_FINE_LOCATION

      if (permissions.hasGrantedPermissions(permission)) {
        promise.resolve(true)
        return@AsyncFunction
      }

      requestPermissions(permissions, arrayOf(permission), promise)
    }

    AsyncFunction("hasBluetoothPermission") { promise: Promise ->
      val permissions = appContext.permissions
        ?: throw IllegalStateException("Permissions module is not available")

      val bluetoothPermissions = getBluetoothRuntimePermissions()
      if (bluetoothPermissions.isEmpty() || permissions.hasGrantedPermissions(*bluetoothPermissions)) {
        promise.resolve(true)
        return@AsyncFunction
      }

      requestPermissions(permissions, bluetoothPermissions, promise)
    }

    AsyncFunction("createPayinConfig") Coroutine { merchantId: String, amountCents: Int ->
      val currentSessionKey = this@RainforestTapSdkModule.sessionKey
        ?: throw IllegalStateException("session key missing")
      if (merchantId.isBlank()) {
        throw IllegalStateException("merchant ID missing")
      }
      val idempotencyKey = UUID.randomUUID().toString()
      val response = RainforestPay.api(this@RainforestTapSdkModule.environment).payinConfigs.createPayinConfig(
        sessionKey = currentSessionKey,
        requestPayload = PayinConfigCreateRequest(
          merchantId = merchantId,
          idempotencyKey = idempotencyKey,
          amount = amountCents,
          currencyCode = "USD"
        )
      )

      val payinConfigId = response.data?.payinConfigId
      if (payinConfigId.isNullOrBlank()) {
        throw IOException(
          response.errors?.joinToString(prefix = "Unable to create payin config: ")
            ?: "Unable to create payin config: missing response data"
        )
      }

      return@Coroutine payinConfigId
    }

    AsyncFunction("present") Coroutine { payinConfigId: String ->
      val ttp = tapToPhone ?: throw IllegalStateException("Tap to Phone is not initialized")
      val activity = appContext.currentActivity
        ?: throw IllegalStateException("Activity is not available")

      return@Coroutine TapUiPresenter.presentTapDialog(
        activity = activity,
        ttp = ttp,
        payinConfigId = payinConfigId
      )
    }

    AsyncFunction("cancelPresented") { promise: Promise ->
      val ttp = tapToPhone ?: run {
        promise.reject("CANCEL_ERROR", "Tap to Phone is not initialized", null)
        return@AsyncFunction
      }

      moduleScope.launch(Dispatchers.IO) {
        try {
          ttp.cancelPresented()
          promise.resolve("success")
        } catch (error: Exception) {
          val actualMessage = error.message ?: error.cause?.message ?: error.toString()
          promise.reject("CANCEL_ERROR", actualMessage, null)
        }
      }
    }

    AsyncFunction("teardown") Coroutine { ->
      listenerJob?.cancel()
      listenerJob = null
      lifecycleJob?.cancel()
      lifecycleJob = null
      tapToPhone?.teardown()
      tapToPhone = null
      sessionKey = null
      deviceRegistrationId = null
      return@Coroutine "success"
    }

    OnDestroy {
      listenerJob?.cancel()
      lifecycleJob?.cancel()
    }
  }

  private suspend fun ensureRuntimePermissions(): Boolean {
    val permissions = appContext.permissions
      ?: throw IllegalStateException("Permissions module is not available")
    val requestedPermissions = arrayOf(
      Manifest.permission.ACCESS_FINE_LOCATION,
      *getBluetoothRuntimePermissions()
    )

    if (permissions.hasGrantedPermissions(*requestedPermissions)) {
      return true
    }

    return suspendCancellableCoroutine { continuation ->
      permissions.askForPermissions(
        PermissionsResponseListener { result ->
          continuation.resume(
            requestedPermissions.all { result[it]?.status == PermissionsStatus.GRANTED }
          )
        },
        *requestedPermissions
      )
    }
  }

  private fun startSdkListener() {
    val ttp = tapToPhone ?: throw IllegalStateException("Tap to Phone is not initialized")
    listenerJob?.cancel()
    listenerJob = moduleScope.launch {
      ttp.events.collect { event: TtpEvent ->
        val eventData = when (event) {
          is TtpEvent.PayinConfigLoaded -> mapOf("type" to "readyForTap")
          is TtpEvent.Preparing -> mapOf("type" to "preparing")
          is TtpEvent.Prepared -> mapOf("type" to "ready")
          is TtpEvent.PresentingStarted -> mapOf("type" to "readyForTap")
          is TtpEvent.Canceled -> mapOf("type" to "canceled")
          is TtpEvent.TapStarted -> mapOf("type" to "readyForTap")
          is TtpEvent.TapComplete -> mapOf("type" to "readCompleted")
          is TtpEvent.Approved -> mapOf("type" to "approved")
          is TtpEvent.Declined -> mapOf("type" to "declined")
          is TtpEvent.Info -> mapOf("type" to "info", "value" to event.toString())
          is TtpEvent.Error -> mapOf("type" to "error", "payload" to event.toString())
          else -> mapOf("type" to "unknown", "payload" to event.toString())
        }

        this@RainforestTapSdkModule.sendEvent("onSdkEvent", eventData)
      }
    }

    lifecycleJob?.cancel()
    lifecycleJob = (ttp as? TapToPhoneAuto)?.let { auto ->
      moduleScope.launch {
        auto.lifecycleEvents.collect { event ->
          val eventData = when (event) {
            is TapToPhoneAutoEvent.PrepareSucceeded -> mapOf("type" to "prepareSucceeded")
            is TapToPhoneAutoEvent.PrepareFailed -> mapOf("type" to "prepareFailed", "payload" to event.reason)
          }
          this@RainforestTapSdkModule.sendEvent("onSdkEvent", eventData)
        }
      }
    }
  }

  private fun mapEnvironment(value: String): Environment {
    return when (value.trim().lowercase(Locale.US)) {
      "dev" -> Environment.DEV
      "production", "prod" -> Environment.PRODUCTION
      "local" -> Environment.LOCAL
      else -> Environment.SANDBOX
    }
  }

  private fun requestPermissions(
    permissions: Permissions,
    requestedPermissions: Array<String>,
    promise: Promise
  ) {
    permissions.askForPermissions(
      PermissionsResponseListener { result ->
        val granted = requestedPermissions.all {
          result[it]?.status == PermissionsStatus.GRANTED
        }
        promise.resolve(granted)
      },
      *requestedPermissions
    )
  }

  private fun getBluetoothRuntimePermissions(): Array<String> {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      arrayOf(
        Manifest.permission.BLUETOOTH_CONNECT,
        Manifest.permission.BLUETOOTH_SCAN
      )
    } else {
      emptyArray()
    }
  }
}
