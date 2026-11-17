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

// Éléments communs de l'app, repris de ceux du site (src/components/client/ui.tsx) : formes carrées, filets de 1 px,
// capitales espacées pour les étiquettes et les boutons, une seule action ivoire par écran, Cormorant Garamond pour
// les titres et les chiffres, Manrope pour le texte.

/** Chiffres alignés, comme sur le site (Cormorant Garamond a des chiffres anciens par défaut). */
const LINING: TextStyle["fontVariant"] = ["lining-nums", "tabular-nums"];
const TABULAR: TextStyle["fontVariant"] = ["tabular-nums"];

export function Screen({
  children,
  footer,
  padTop = true,
  gap = spacing.lg,
}: {
  children: ReactNode;
  /** Barre d'action fixée en bas (Continuer, Confirmer…). */
  footer?: ReactNode;
  padTop?: boolean;
  gap?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: padTop ? insets.top + spacing.lg : spacing.lg,
          paddingHorizontal: spacing.xl,
          paddingBottom: spacing.xxl,
          gap,
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

/** Espace insécable avant « ? », « ! », « : » : la ponctuation ne passe jamais seule à la ligne (typographie française). */
const tight = (children: ReactNode) =>
  typeof children === "string" ? children.replace(/ ([?!:;])/g, " $1") : children;

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[styles.title, style]}>
      {tight(children)}
    </Text>
  );
}

/** Titre de section (« Horaires », « Accès ») : Cormorant, grand. */
export function Heading({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[styles.heading, style]}>
      {children}
    </Text>
  );
}

export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, style]}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

/** Étiquette en capitales espacées (« FIDÉLITÉ », nom d'un champ). */
export function LabelCaps({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.labelCaps, style]}>{children}</Text>;
}

/** Le repère rond bleu devant une étiquette (D-97 : la forme ronde est gardée). */
export function Mark({ size = 9 }: { size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: colors.accent }}
    />
  );
}

/** Étiquette de section : repère bleu + capitales espacées, et une note à droite si besoin. */
export function Eyebrow({ children, aside }: { children: ReactNode; aside?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Mark />
      <Text accessibilityRole="header" style={styles.eyebrow}>
        {children}
      </Text>
      {aside ? <Text style={[styles.muted, { marginLeft: "auto" }]}>{aside}</Text> : null}
    </View>
  );
}

/** Filet fin entre deux lignes. */
export function Rule({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: "rgba(239,233,221,0.22)" }, style]} />;
}

/** Bloc encadré d'un filet ; `accent` : liseré bleu et voile léger (carte de fidélité, offre). */
export function Card({
  children,
  style,
  accent,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: boolean;
}) {
  return <View style={[styles.card, accent && styles.cardAccent, style]}>{children}</View>;
}

type ButtonKind = "primary" | "secondary" | "danger";

/** Boutons carrés en capitales espacées : ivoire (principal), au filet (secondaire), brique (suppression). */
export function Button({
  label,
  onPress,
  kind = "primary",
  disabled,
  loading,
  arrow,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  loading?: boolean;
  /** Flèche après le libellé (« RÉSERVER → »), comme le bouton principal du site. */
  arrow?: boolean;
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
        inactive && { opacity: 0.35 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={kind === "primary" ? colors.ink : colors.ivory} />
      ) : (
        <Text
          style={[
            kind === "primary" ? styles.labelPrimary : styles.labelSecondary,
            kind === "danger" && { color: colors.brick },
          ]}
        >
          {label}
          {arrow ? "   →" : ""}
        </Text>
      )}
    </Pressable>
  );
}

/** Champ souligné, comme ceux du site : nom en capitales au-dessus, simple filet dessous. */
export function Field({
  label,
  error,
  aside,
  ...input
}: { label: string; error?: string; aside?: string } & TextInputProps) {
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={styles.labelCaps}>{label}</Text>
        {aside ? <Text style={[styles.muted, { fontSize: 12 }]}>{aside}</Text> : null}
      </View>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#6f6a62"
        selectionColor={colors.accent}
        {...input}
        style={[styles.input, error ? { borderBottomColor: colors.brick } : null, input.style]}
      />
      {error ? <Text style={[styles.error, { paddingTop: 6 }]}>{error}</Text> : null}
    </View>
  );
}

/** Message d'erreur : filet brique et liseré à gauche, jamais d'aplat (Problem du site). */
export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        borderWidth: 1,
        borderColor: "rgba(217,116,95,0.5)",
        paddingVertical: 14,
        paddingLeft: 20,
        paddingRight: 16,
      }}
    >
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, backgroundColor: colors.brick }} />
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.ivory }}>{children}</Text>
    </View>
  );
}

/** Case à cocher carrée du site. */
export function Check({ checked }: { checked: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      style={{
        width: 22,
        height: 22,
        borderWidth: 1,
        borderColor: checked ? colors.ivory : "rgba(239,233,221,0.35)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked ? <Text style={{ color: colors.ivory, fontSize: 14, lineHeight: 16 }}>✓</Text> : null}
    </View>
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

/** Créneau ou choix : carré au filet ; choisi, il passe à l'ivoire. */
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
  screen: { flex: 1, backgroundColor: "transparent" },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.sm,
    backgroundColor: "rgba(0,13,29,0.94)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(239,233,221,0.22)",
  },
  title: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: colors.ivory, fontVariant: LINING },
  heading: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, color: colors.ivory, fontVariant: LINING },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.ivory, fontVariant: TABULAR },
  muted: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, color: colors.stone, fontVariant: TABULAR },
  labelCaps: {
    fontFamily: fonts.sansSemi,
    fontSize: 10,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: colors.stone,
  },
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 3.3,
    textTransform: "uppercase",
    color: colors.ivorySoft,
  },
  card: {
    borderWidth: 1,
    borderColor: "rgba(239,233,221,0.14)",
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 8,
  },
  cardAccent: { borderColor: "rgba(61,139,255,0.35)", backgroundColor: "rgba(61,139,255,0.05)" },
  button: { alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl },
  buttonPrimary: { height: 58, backgroundColor: colors.ivory },
  buttonSecondary: { height: 52, borderWidth: 1, borderColor: "rgba(239,233,221,0.32)" },
  buttonDanger: { height: 52, borderWidth: 1, borderColor: "rgba(217,116,95,0.6)" },
  labelPrimary: {
    fontFamily: fonts.sansSemi,
    fontSize: 12,
    letterSpacing: 3.1,
    textTransform: "uppercase",
    color: colors.ink,
  },
  labelSecondary: {
    fontFamily: fonts.sansSemi,
    fontSize: 11,
    letterSpacing: 2.6,
    textTransform: "uppercase",
    color: colors.ivory,
  },
  input: {
    minHeight: 46,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(239,233,221,0.22)",
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ivory,
  },
  error: { fontFamily: fonts.sans, fontSize: 13, color: colors.brick },
  chip: {
    minHeight: 48,
    minWidth: 76,
    borderWidth: 1,
    borderColor: "rgba(239,233,221,0.24)",
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  chipSelected: { backgroundColor: colors.ivory, borderColor: colors.ivory },
  chipLabel: { fontFamily: fonts.sansSemi, fontSize: 14, color: colors.ivory, fontVariant: TABULAR },
  chipCaption: { fontFamily: fonts.sans, fontSize: 11, color: colors.stone },
});
