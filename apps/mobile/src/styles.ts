import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f4ed",
  },
  screenCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#f7f4ed",
  },
  container: {
    padding: 20,
    gap: 16,
  },
  kicker: {
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#4f6a7e",
    fontWeight: "600",
  },
  heading: {
    fontSize: 30,
    lineHeight: 34,
    color: "#17242d",
    fontWeight: "700",
  },
  helperText: {
    color: "#4e606d",
    fontSize: 14,
  },
  errorText: {
    color: "#9b2d20",
    fontSize: 13,
  },
  panel: {
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d5ddd8",
    overflow: "hidden",
  },
  panelTitle: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#e8efe9",
    color: "#1f2f28",
    fontWeight: "600",
  },
  panelBody: {
    padding: 14,
    gap: 12,
  },
  listItem: {
    gap: 10,
    paddingVertical: 6,
  },
  bodyText: {
    color: "#2f404c",
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    fontSize: 13,
    color: "#435562",
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ced8de",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fbfcfc",
    color: "#1f2f38",
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  primaryButton: {
    borderRadius: 10,
    paddingVertical: 11,
    backgroundColor: "#165177",
    alignItems: "center",
  },
  primaryButtonDisabled: {
    backgroundColor: "#7b97ab",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  secondaryButton: {
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#7391a6",
    alignItems: "center",
    backgroundColor: "#f7fbff",
  },
  secondaryButtonDisabled: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    color: "#1f4f6e",
    fontWeight: "600",
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c6d2da",
    backgroundColor: "#ffffff",
  },
  tagSelected: {
    borderColor: "#165177",
    backgroundColor: "#e5f0f7",
  },
  tagText: {
    color: "#395061",
    fontSize: 13,
  },
  tagTextSelected: {
    color: "#0f4261",
    fontWeight: "600",
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  counterButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c5d1d9",
    alignItems: "center",
    justifyContent: "center",
  },
  counterButtonText: {
    fontSize: 18,
    color: "#2a3d4a",
  },
  counterValue: {
    minWidth: 36,
    textAlign: "center",
    fontWeight: "600",
    color: "#1d2c36",
  },
  tabContent: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#d6ddd7",
    backgroundColor: "#ffffff",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "#e4f0f7",
  },
  tabButtonText: {
    fontSize: 12,
    color: "#526575",
    fontWeight: "500",
  },
  tabButtonTextActive: {
    color: "#134c6e",
    fontWeight: "700",
  },
});
