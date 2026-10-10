import type { ProviderAuthInfo } from "@cline/shared/browser";
import {
	isCredentialFailure,
	resolveCredentialFailureHint,
} from "@/hooks/chat-session/helpers";

const RUN_PREFIX = "运行失败：";

/** Error-role notice that is not a failure and is shown verbatim. */
export const HUB_INTERRUPTED_MESSAGE_KIND = "hub_interrupted";

/** The same presentation for live failures and restored transcript errors. */
export function formatRunError(
	detail: string,
	providerId = "",
	providerAuth?: ProviderAuthInfo,
): string {
	const description = detail.trim();
	const guidance = resolveCredentialFailureHint(providerId, providerAuth);
	const looksCredentialRelated =
		!description || isCredentialFailure(description);
	// Upstream (sdk core) emits the English prefix; this module emits RUN_PREFIX.
	// Both must be recognized so re-formatting a stored message stays idempotent.
	const alreadyPrefixed =
		description.startsWith("The run failed") ||
		description.startsWith(RUN_PREFIX);
	return [
		description
			? alreadyPrefixed
				? description
				: `${RUN_PREFIX}${description}`
			: "运行失败，未产生任何回复。",
		looksCredentialRelated && !description.includes(guidance) ? guidance : "",
	]
		.filter(Boolean)
		.join(" ");
}
