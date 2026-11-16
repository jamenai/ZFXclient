import { saveSettings, settingsApi } from "./settings/settings.js";
import { isColor, labelEntry, openLabelEditor } from "./accountLabels.js";

const LABEL_MAX_LENGTH = 30;

let entries = [];
let accountNames = [];

function getLabels() {
  const labels = settingsApi.getRecord("savedAccountLabels");
  return labels !== null && typeof labels === "object" ? labels : {};
}

function getDetails(accountName) {
  const details = getLabels()[accountName];
  return {
    label: typeof details?.label === "string" ? details.label.trim().slice(0, LABEL_MAX_LENGTH) : "",
    color: isColor(details?.color) ? details.color : ""
  };
}

function render() {
  entries.forEach((entry, i) => {
    const { label, color } = getDetails(accountNames[i]);
    labelEntry(entry, accountNames[i], label, color);
  });
}

function decorate(listEntries, listAccountNames) {
  entries = listEntries;
  accountNames = listAccountNames;
  render();
}

function editAccount(accountName) {
  if (typeof accountName !== "string" || !accountName) return;
  if (accountName === undefined) return;
  openLabelEditor({
    title: "Saved Account Label",
    accountName,
    ...getDetails(accountName),
    placeholder: "Name or description",
    maxLength: LABEL_MAX_LENGTH,
    onSave: (label, color) => {
      const labels = getLabels();
      if (label || color) labels[accountName] = { label, color };
      else delete labels[accountName];
      settingsApi.set("savedAccountLabels", labels);
      saveSettings();
      render();
      window.dispatchEvent(new Event("fx-saved-account-labels-update"));
    }
  });
}

function edit(selectedIndex) {
  editAccount(accountNames[Math.min(selectedIndex, accountNames.length - 1)]);
}

export default { decorate, edit, editAccount, getDetails };
