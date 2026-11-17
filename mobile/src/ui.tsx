import * as Haptics from "expo-haptics";
import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, spacing } from "@/theme";

// Petits éléments d'interface partagés par tous les écrans (charte bleue des lots 12 et 18).

export function Screen({
  children,
  footer,
  padTop = true,
}: {
  children: ReactNode;
  /** Barre d'action fixée en bas (Continuer, Confirmer…). */
  footer?: ReactNode;
  padTop?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: padTop ? insets.top + spacing.lg : spacing.lg,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xxl,
          gap: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {children}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>{footer}</View>
      ) : null}
    </View>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[styles.title, style]}>
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonKind = "primary" | "secondary" | "danger";

export function Button({
  label,
  onPress,
  kind = "primary",
  disabled,
  loading,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        kind === "primary" && styles.buttonPrimary,
        kind === "secondary" && styles.buttonSecondary,
        kind === "danger" && styles.buttonDanger,
        inactive && styles.buttonDisabled,
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={kind === "primary" ? colors.ink : colors.ivory} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            kind === "primary" && { color: colors.ink },
            kind === "danger" && { color: colors.brick },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  ...input
}: { label: string; error?: string } & TextInputProps) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.stone}
        selectionColor={colors.accent}
        {...input}
        style={[styles.input, error ? { borderColor: colors.brick } : null, input.style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  );
}

/** Chargement, erreur avec « Réessayer », ou le contenu : jamais d'écran blanc. */
export function LoadState({
  loading,
  error,
  hasData,
  reload,
  children,
}: {
  loading: boolean;
  error: string | null;
  hasData: boolean;
  reload: () => void;
  children: ReactNode;
}) {
  if (hasData) return <>{children}</>;
  if (loading) {
    return (
      <View style={{ paddingVertical: spacing.xxl }} accessibilityRole="progressbar">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return (
    <View style={{ gap: spacing.md }}>
      <ErrorText>{error ?? "Une erreur est survenue."}</ErrorText>
      <Button label="Réessayer" kind="secondary" onPress={reload} />
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: spacing.md }, style]}>{children}</View>;
}

export function Chip({
  label,
  selected,
  onPress,
  disabled,
  caption,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
  caption?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={[styles.chip, selected && styles.chipSelected, disabled && { opacity: 0.4 }]}
    >
      <Text style={[styles.chipLabel, selected && { color: colors.ink }]}>{label}</Text>
      {caption ? <Text style={[styles.chipCaption, selected && { color: colors.ink }]}>{caption}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
    backgroundColor: "rgba(0,13,29,0.94)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  title: { fontFamily: fonts.displaySemi, fontSize: 34, lineHeight: 38, color: colors.ivory },
  heading: { fontFamily: fonts.displaySemi, fontSize: 24, color: colors.ivory },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.ivory },
  muted: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: colors.stone },
  card: {
    backgroundColor: colors.charcoal,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  button: {
    minHeight: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  buttonPrimary: { backgroundColor: colors.ivory },
  buttonSecondary: { borderWidth: 1, borderColor: colors.lineStrong },
  buttonDanger: { borderWidth: 1, borderColor: colors.brick },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { fontFamily: fonts.sansSemi, fontSize: 15, color: colors.ivory },
  label: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.ivorySoft },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.charcoal,
    paddingHorizontal: spacing.lg,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ivory,
  },
  error: { fontFamily: fonts.sans, fontSize: 13, color: colors.brick },
  chip: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  chipSelected: { backgroundColor: colors.ivory, borderColor: colors.ivory },
  chipLabel: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.ivory },
  chipCaption: { fontFamily: fonts.sans, fontSize: 11, color: colors.stone },
});
