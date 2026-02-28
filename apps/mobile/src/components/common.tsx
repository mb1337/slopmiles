import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../styles";

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <View style={styles.panelBody}>{children}</View>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.primaryButton, disabled ? styles.primaryButtonDisabled : null]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.secondaryButton, disabled ? styles.secondaryButtonDisabled : null]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function ChoiceRow({
  options,
  selected,
  onChange,
}: {
  options: readonly string[];
  selected: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.tagRow}>
      {options.map((option) => (
        <Pressable
          key={option}
          style={[styles.tag, selected === option ? styles.tagSelected : null]}
          onPress={() => onChange(option)}
        >
          <Text style={[styles.tagText, selected === option ? styles.tagTextSelected : null]}>{option}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function TagGrid({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: readonly string[];
  onToggle: (value: string) => void;
}) {
  return (
    <View style={styles.tagRow}>
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <Pressable
            key={option}
            style={[styles.tag, active ? styles.tagSelected : null]}
            onPress={() => onToggle(option)}
          >
            <Text style={[styles.tagText, active ? styles.tagTextSelected : null]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Counter({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.counterRow}>
      <Pressable style={styles.counterButton} onPress={() => onChange(Math.max(min, value - 1))}>
        <Text style={styles.counterButtonText}>-</Text>
      </Pressable>
      <Text style={styles.counterValue}>{value}</Text>
      <Pressable style={styles.counterButton} onPress={() => onChange(Math.min(max, value + 1))}>
        <Text style={styles.counterButtonText}>+</Text>
      </Pressable>
    </View>
  );
}
