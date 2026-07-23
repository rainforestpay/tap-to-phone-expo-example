import { NativeModule, requireNativeModule } from 'expo';

export type SdkEnvironment = 'local' | 'dev' | 'sandbox' | 'production' | 'prod';

export type SdkEventPayload =
  | { type: 'approved' }
  | { type: 'attempted' }
  | { type: 'canceled' }
  | { type: 'declined' }
  | { type: 'inProgress' }
  | { type: 'preparing' }
  | { type: 'ready' }
  | { type: 'readyForTap' }
  | { type: 'readCompleted' }
  | { type: 'userInterfaceDismissed' }
  | { type: 'configured' }
  | { type: 'invalidSessionKey' }
  | { type: 'prepareSucceeded' }
  | { type: 'prepareFailed'; payload: string }
  | { type: 'info'; value: string }
  | { type: 'error'; payload: string }
  | { type: 'unknown'; payload: string };

type RainforestTapSdkEvents = {
  onSdkEvent: (event: SdkEventPayload) => void;
};

declare class RainforestTapSdkModule extends NativeModule<RainforestTapSdkEvents> {
  /** Runs one-time setup, then starts auto mode: the SDK prepares and resumes on its own. */
  initialize(sessionKey: string, environment: SdkEnvironment, deviceRegistrationId: string): Promise<void>;
  getSdkVersion(): string;
  getInfo(): Record<string, unknown>;
  isTapSdkReady(): boolean;
  hasLocationPermission(): Promise<boolean>;
  hasBluetoothPermission(): Promise<boolean>;
  createPayinConfig(merchantId: string, amountCents: number): Promise<string>;
  present(payinConfigId: string): Promise<string>;
  cancelPresented(): Promise<string>;
  teardown(): Promise<string>;
}

export default requireNativeModule<RainforestTapSdkModule>('RainforestTapSdk');
