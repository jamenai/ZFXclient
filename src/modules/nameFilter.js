import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import { settingsApi } from "./settings/settings.js";

const PLACEHOLDER_NAME = "Hidden Name";

const matcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers
});

function isInappropriate(name) {
    return matcher.hasMatch(name);
}

function filter(name) {
    if (typeof name !== "string" || !settingsApi.getBoolean("hideInappropriateNames")) return name;
    return isInappropriate(name) ? PLACEHOLDER_NAME : name;
}

export default { filter, isInappropriate };
