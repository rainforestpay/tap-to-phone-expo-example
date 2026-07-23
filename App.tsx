import { MaterialIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import RainforestTapSdk, {
    type SdkEnvironment,
    type SdkEventPayload,
} from './modules/rainforestpay-tap-sdk/src';

const ENVIRONMENT = (process.env.EXPO_PUBLIC_ENVIRONMENT as SdkEnvironment | undefined) ?? 'sandbox';

const CapyColors = {
    background: '#F8F2E8',
    card: '#FFFBF6',
    border: 'rgba(108,67,41,0.2)',
    cocoa: '#4E2E1F',
    cocoaSoft: '#7E6151',
    leaf: '#5F8A56',
    pop: '#CE7B55',
};

type Phase = 'idle' | 'preparing' | 'prepared' | 'paying' | 'approved' | 'declined' | 'cancelled' | 'failed';

const phaseCopy: Record<Phase, { title: string; detail: string }> = {
    idle: { title: 'Ready to start', detail: 'Enter your credentials and start Tap to Phone.' },
    preparing: { title: 'Starting Tap to Phone', detail: 'Checking permissions and merchant terms.' },
    prepared: { title: 'Reader ready', detail: 'The SDK keeps the reader prepared. Enter an amount and ask the shopper to tap.' },
    paying: { title: 'Waiting for tap', detail: 'Ask the shopper to tap a contactless card or wallet.' },
    approved: { title: 'Payment approved', detail: 'The tap was successful.' },
    declined: { title: 'Payment declined', detail: 'The card issuer declined this payment.' },
    cancelled: { title: 'Tap cancelled', detail: 'The checkout was cancelled before authorization.' },
    failed: { title: 'Something went wrong', detail: 'The SDK returned an error.' },
};

const phaseIcon: Record<Phase, keyof typeof MaterialIcons.glyphMap> = {
    idle: 'contactless',
    preparing: 'contactless',
    prepared: 'contactless',
    paying: 'contactless',
    approved: 'check-circle',
    declined: 'cancel',
    cancelled: 'cancel',
    failed: 'error-outline',
};

const phaseColor: Record<Phase, string> = {
    idle: CapyColors.cocoaSoft,
    preparing: CapyColors.cocoaSoft,
    prepared: CapyColors.leaf,
    paying: CapyColors.leaf,
    approved: CapyColors.leaf,
    declined: CapyColors.pop,
    cancelled: CapyColors.cocoaSoft,
    failed: CapyColors.pop,
};

export default function App() {
    const [deviceRegistrationId, setDeviceRegistrationId] = useState(
        process.env.EXPO_PUBLIC_DEVICE_REGISTRATION_ID ?? ''
    );
    const [apiKey, setApiKey] = useState(process.env.EXPO_PUBLIC_SESSION_KEY ?? '');
    const [merchantId, setMerchantId] = useState(process.env.EXPO_PUBLIC_MERCHANT_ID ?? '');
    const [amount, setAmount] = useState('');

    const [phase, setPhase] = useState<Phase>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [sdkVersion, setSdkVersion] = useState('');

    const isBusy = phase === 'preparing' || phase === 'paying';
    const isPrepared =
        phase === 'prepared' ||
        phase === 'paying' ||
        phase === 'approved' ||
        phase === 'declined' ||
        phase === 'cancelled' ||
        phase === 'failed';
    const canStart =
        !isBusy && deviceRegistrationId.trim().length > 0 && apiKey.trim().length > 0 && merchantId.trim().length > 0;
    const canPay = !isBusy && phase !== 'idle' && parseFloat(amount) > 0;

    useEffect(() => {
        try {
            setSdkVersion(RainforestTapSdk.getSdkVersion());
        } catch {
            setSdkVersion('unavailable');
        }

        const subscription = RainforestTapSdk.addListener('onSdkEvent', (event: SdkEventPayload) => {
            if (event.type === 'error') setErrorMessage(event.payload);
            // Auto mode retries a failed background prepare on its own; only surface it.
            if (event.type === 'prepareFailed') setErrorMessage(`Background prepare failed: ${event.payload}`);
            if (event.type === 'prepareSucceeded') setErrorMessage('');
            if (event.type === 'invalidSessionKey') {
                setPhase('failed');
                setErrorMessage('Session key is no longer valid. Enter a new one and start again.');
            }
        });

        return () => subscription.remove();
    }, []);

    const startTapToPhone = async () => {
        setPhase('preparing');
        setErrorMessage('');

        try {
            // Auto mode: one call runs first-time setup and hands prepare/resume to the SDK.
            await RainforestTapSdk.initialize(apiKey.trim(), ENVIRONMENT, deviceRegistrationId.trim());
            setPhase('prepared');
        } catch (error) {
            setPhase('failed');
            setErrorMessage(error instanceof Error ? error.message : String(error));
        }
    };

    const pay = async () => {
        const amountCents = Math.round(parseFloat(amount) * 100);
        if (!Number.isFinite(amountCents) || amountCents <= 0) return;

        setPhase('paying');
        setErrorMessage('');

        try {
            const payinConfigId = await RainforestTapSdk.createPayinConfig(merchantId.trim(), amountCents);
            const result = await RainforestTapSdk.present(payinConfigId);

            if (result === 'success') {
                setPhase('approved');
            } else if (result === 'cancel') {
                setPhase('cancelled');
            } else {
                setPhase('declined');
                setErrorMessage(result);
            }
        } catch (error) {
            setPhase('failed');
            setErrorMessage(error instanceof Error ? error.message : String(error));
        }
    };

    const copy = phaseCopy[phase];

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar style="dark" />
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.title}>Capyshop</Text>
                <Text style={styles.subtitle}>Tap to Phone demo</Text>

                <View style={styles.card}>
                    <Field
                        label="Device registration ID"
                        value={deviceRegistrationId}
                        onChangeText={setDeviceRegistrationId}
                        autoCapitalize="none"
                        editable={!isBusy}
                    />
                    <Field
                        label="API key"
                        value={apiKey}
                        onChangeText={setApiKey}
                        autoCapitalize="none"
                        editable={!isBusy}
                    />
                    <Field
                        label="Merchant ID"
                        value={merchantId}
                        onChangeText={setMerchantId}
                        autoCapitalize="none"
                        editable={!isBusy}
                    />
                    <View style={styles.field}>
                        <Text style={styles.label}>Environment</Text>
                        <Text style={styles.staticValue}>{ENVIRONMENT}</Text>
                    </View>

                    <PrimaryButton
                        title="Start Tap to Phone"
                        icon="contactless"
                        busy={phase === 'preparing'}
                        disabled={!canStart}
                        onPress={startTapToPhone}
                    />
                </View>

                {isPrepared ? (
                    <View style={styles.card}>
                        <Field
                            label="Amount (USD)"
                            value={amount}
                            onChangeText={setAmount}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            editable={!isBusy}
                        />
                        <PrimaryButton
                            title="Pay"
                            icon="credit-card"
                            busy={phase === 'paying'}
                            disabled={!canPay}
                            onPress={pay}
                        />
                    </View>
                ) : null}

                <View style={[styles.statusCard, { borderColor: phaseColor[phase] }]}>
                    {isBusy ? (
                        <ActivityIndicator color={phaseColor[phase]} size="large" />
                    ) : (
                        <MaterialIcons name={phaseIcon[phase]} size={40} color={phaseColor[phase]} />
                    )}
                    <Text style={styles.statusTitle}>{copy.title}</Text>
                    <Text style={styles.statusDetail}>{copy.detail}</Text>
                    {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
                </View>

                {sdkVersion ? <Text style={styles.sdkVersion}>SDK {sdkVersion}</Text> : null}
            </ScrollView>
        </SafeAreaView>
    );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
    const { label, ...inputProps } = props;
    return (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput style={styles.input} placeholderTextColor="#9B8172" {...inputProps} />
        </View>
    );
}

function PrimaryButton({
    title,
    icon,
    onPress,
    disabled = false,
    busy = false,
}: {
    title: string;
    icon: keyof typeof MaterialIcons.glyphMap;
    onPress: () => void;
    disabled?: boolean;
    busy?: boolean;
}) {
    return (
        <Pressable
            style={[styles.primaryButton, disabled && styles.disabledButton]}
            onPress={onPress}
            disabled={disabled}
        >
            {busy ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
                <MaterialIcons name={icon} size={20} color="#FFFFFF" />
            )}
            <Text style={styles.primaryButtonText}>{title}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: CapyColors.background },
    content: { gap: 16, padding: 20 },
    title: { color: CapyColors.cocoa, fontSize: 32, fontWeight: '900' },
    subtitle: { color: CapyColors.cocoaSoft, fontSize: 16, marginBottom: 8, marginTop: 2 },
    card: { backgroundColor: CapyColors.card, borderColor: CapyColors.border, borderRadius: 8, borderWidth: 1, gap: 12, padding: 20 },
    field: { gap: 6 },
    label: { color: CapyColors.cocoa, fontSize: 13, fontWeight: '800' },
    staticValue: { color: CapyColors.cocoaSoft, fontSize: 16, minHeight: 24 },
    input: { backgroundColor: '#FFFFFF', borderColor: CapyColors.border, borderRadius: 8, borderWidth: 1, color: CapyColors.cocoa, fontSize: 16, minHeight: 48, paddingHorizontal: 12 },
    primaryButton: { alignItems: 'center', backgroundColor: CapyColors.leaf, borderRadius: 8, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 48, paddingHorizontal: 18 },
    primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    disabledButton: { opacity: 0.5 },
    statusCard: { alignItems: 'center', backgroundColor: CapyColors.card, borderRadius: 8, borderWidth: 1.5, gap: 8, padding: 20 },
    statusTitle: { color: CapyColors.cocoa, fontSize: 18, fontWeight: '800', textAlign: 'center' },
    statusDetail: { color: CapyColors.cocoaSoft, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    errorText: { color: CapyColors.pop, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    sdkVersion: { color: CapyColors.cocoaSoft, fontSize: 12, textAlign: 'center' },
});
