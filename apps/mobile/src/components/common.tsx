import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import DateTimePicker, { type DateType, useDefaultStyles } from "react-native-ui-datepicker";

import { styles } from "../styles";

type CrossPlatformPickerMode = "date" | "time";

function coercePickerDate(value: DateType): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (typeof value === "object" && value && "toDate" in value && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }

  return null;
}

export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.screenHeader}>
      <View style={styles.screenHeaderCopy}>
        <Text style={styles.kicker}>{eyebrow}</Text>
        <Text style={styles.heading}>{title}</Text>
        {subtitle ? <Text style={styles.helperText}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? <SecondaryButton label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export function StatusBanner({
  tone = "info",
  message,
}: {
  tone?: "info" | "success" | "error";
  message: string;
}) {
  return (
    <View
      style={[
        styles.statusBanner,
        tone === "success" ? styles.statusBannerSuccess : null,
        tone === "error" ? styles.statusBannerError : null,
      ]}
    >
      <Text
        style={[
          styles.statusBannerText,
          tone === "success" ? styles.statusBannerTextSuccess : null,
          tone === "error" ? styles.statusBannerTextError : null,
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

export function SectionCard({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      {title || description ? (
        <View style={styles.sectionCardHeader}>
          {title ? <Text style={styles.sectionCardTitle}>{title}</Text> : null}
          {description ? <Text style={styles.helperText}>{description}</Text> : null}
        </View>
      ) : null}
      <View style={styles.sectionCardBody}>{children}</View>
    </View>
  );
}

export function EmptyStateCard({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <SectionCard>
      <View style={styles.emptyState}>
        <Text style={styles.sectionCardTitle}>{title}</Text>
        <Text style={styles.bodyText}>{body}</Text>
        {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} /> : null}
      </View>
    </SectionCard>
  );
}

export function FieldGroup({
  label,
  helperText,
  errorText,
  children,
}: {
  label: string;
  helperText?: string;
  errorText?: string | null;
  children: ReactNode;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
      {children}
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
    </View>
  );
}

export function PickerField({
  value,
  placeholder,
  onPress,
}: {
  value?: string | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.pickerField} onPress={onPress}>
      <Text style={value ? styles.pickerFieldValue : styles.pickerFieldPlaceholder}>{value ?? placeholder}</Text>
    </Pressable>
  );
}

export function CrossPlatformPickerSheet({
  visible,
  title,
  mode,
  value,
  minimumDate,
  maximumDate,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  mode: CrossPlatformPickerMode;
  value: Date;
  minimumDate?: Date;
  maximumDate?: Date;
  onCancel: () => void;
  onConfirm: (value: Date) => void;
}) {
  const defaultPickerStyles = useDefaultStyles();
  const pickerStyles = useMemo(
    () => ({
      ...defaultPickerStyles,
      selected: {
        ...(defaultPickerStyles.selected ?? {}),
        backgroundColor: "#164f73",
        borderColor: "#164f73",
      },
      selected_label: {
        ...(defaultPickerStyles.selected_label ?? {}),
        color: "#ffffff",
      },
      today: {
        ...(defaultPickerStyles.today ?? {}),
        borderColor: "#164f73",
      },
      button_next: {
        ...(defaultPickerStyles.button_next ?? {}),
        borderColor: "#d1dae0",
      },
      button_prev: {
        ...(defaultPickerStyles.button_prev ?? {}),
        borderColor: "#d1dae0",
      },
      day: {
        ...(defaultPickerStyles.day ?? {}),
        borderRadius: 10,
      },
      time_label: {
        ...(defaultPickerStyles.time_label ?? {}),
        color: "#213540",
      },
    }),
    [defaultPickerStyles],
  );
  const [draftValue, setDraftValue] = useState(value);
  const valueSignature = value.getTime();

  useEffect(() => {
    if (!visible) {
      return;
    }

    setDraftValue(value);
  }, [valueSignature, visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.pickerSheetOverlay}>
        <Pressable style={styles.pickerSheetBackdrop} onPress={onCancel} />
        <View style={styles.pickerSheetCard}>
          <View style={styles.pickerSheetHeader}>
            <Text style={styles.sectionCardTitle}>{title}</Text>
            <View style={styles.pickerSheetActions}>
              <SecondaryButton label="Cancel" onPress={onCancel} />
              <PrimaryButton
                label="Done"
                onPress={() => {
                  onConfirm(draftValue);
                }}
              />
            </View>
          </View>
          <DateTimePicker
            mode="single"
            date={draftValue}
            onChange={({ date }) => {
              const nextDate = coercePickerDate(date);
              if (!nextDate) {
                return;
              }
              setDraftValue(nextDate);
            }}
            minDate={minimumDate}
            maxDate={maximumDate}
            timePicker={mode === "time"}
            initialView={mode === "time" ? "time" : "day"}
            use12Hours={mode === "time"}
            firstDayOfWeek={0}
            styles={pickerStyles}
          />
        </View>
      </View>
    </Modal>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return <View style={styles.metricGrid}>{children}</View>;
}

export function MetricStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {hint ? <Text style={styles.helperText}>{hint}</Text> : null}
    </View>
  );
}

export function StickyActionBar({ children }: { children: ReactNode }) {
  return <View style={styles.stickyActionBar}>{children}</View>;
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <SectionCard title={title}>{children}</SectionCard>;
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
          style={[styles.segmentedChip, selected === option ? styles.segmentedChipSelected : null]}
          onPress={() => onChange(option)}
        >
          <Text style={[styles.segmentedChipText, selected === option ? styles.segmentedChipTextSelected : null]}>
            {option}
          </Text>
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
