import {
	agentMarkdownControls,
	markdownCodeHighlighter,
} from "@cline/ui/components/markdown";
import { cjk } from "@streamdown/cjk";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { isValidElement, memo, useState } from "react";
import {
	type Components,
	type ExtraProps,
	type LinkSafetyModalProps,
	Streamdown,
} from "streamdown";
import { openExternalUrl } from "@/lib/desktop-client";
import { cn } from "@/lib/utils";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "./alert-dialog";

const streamdownPlugins = { cjk, code: markdownCodeHighlighter };

/**
 * streamdown 内置 UI 文案的中文覆盖。
 *
 * 该库的按钮文案（复制代码 / 全屏 / 打开链接 / 下载图片 …）硬编码在
 * dist chunk 里，无法通过改源码汉化；但它开放了 `translations` prop，
 * 因此用官方途径覆盖，不 fork 依赖、不改 node_modules。
 *
 * 键名与默认值取自 streamdown 的 `StreamdownTranslations` 接口，
 * 新增键时上游会自动补默认值，不影响未覆盖的项。
 */
const streamdownTranslations = {
	close: "关闭",
	copied: "已复制",
	copyCode: "复制代码",
	copyLink: "复制链接",
	copyTable: "复制表格",
	copyTableAsCsv: "复制表格为 CSV",
	copyTableAsMarkdown: "复制表格为 Markdown",
	copyTableAsTsv: "复制表格为 TSV",
	downloadDiagram: "下载图表",
	downloadDiagramAsMmd: "下载图表为 MMD",
	downloadDiagramAsPng: "下载图表为 PNG",
	downloadDiagramAsSvg: "下载图表为 SVG",
	downloadFile: "下载文件",
	downloadImage: "下载图片",
	downloadTable: "下载表格",
	downloadTableAsCsv: "下载表格为 CSV",
	downloadTableAsMarkdown: "下载表格为 Markdown",
	exitFullscreen: "退出全屏",
	externalLinkWarning: "你即将访问一个外部网站。",
	imageNotAvailable: "图片不可用",
	mermaidFormatMmd: "MMD",
	mermaidFormatPng: "PNG",
	mermaidFormatSvg: "SVG",
	openExternalLink: "打开外部链接？",
	openLink: "打开链接",
	resetView: "重置缩放与平移",
	tableFormatCsv: "CSV",
	tableFormatMarkdown: "Markdown",
	tableFormatTsv: "TSV",
	viewFullscreen: "全屏查看",
	zoomIn: "放大",
	zoomOut: "缩小",
} satisfies NonNullable<ComponentProps<typeof Streamdown>["translations"]>;

export function MarkdownLinkSafetyModal({
	isOpen,
	onClose,
	onConfirm,
	url,
}: LinkSafetyModalProps) {
	return (
		<AlertDialog
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			open={isOpen}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>打开外部链接？</AlertDialogTitle>
					<AlertDialogDescription>
						你即将离开 Cline 并访问此地址。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="max-h-32 overflow-y-auto wrap-break-word rounded-md bg-muted p-3 font-mono text-sm">
					{url}
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>打开链接</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

type MarkdownLinkProps = ComponentProps<"a"> & ExtraProps;

function extractLinkText(children: ReactNode): string {
	if (typeof children === "string" || typeof children === "number") {
		return String(children);
	}
	if (Array.isArray(children)) {
		return children.map(extractLinkText).join("");
	}
	// Inline formatting (**bold**, `code`, …) nests the label text inside
	// elements; recurse so styled hostnames can't dodge the deception check.
	if (isValidElement(children)) {
		return extractLinkText(
			(children.props as { children?: ReactNode }).children,
		);
	}
	return "";
}

// Tolerates one trailing dot after the TLD ("github.com." resolves the same
// as "github.com" in browsers) and a protocol-relative "//" prefix, so those
// label spellings can't slip past the deception check.
const urlLikeTextPattern =
	/^(?:https?:\/\/|\/\/)?(?:[\w-]+\.)+[a-z]{2,}\.?(?:[/:?#]\S*)?$/i;

type LinkParts = {
	protocol: string;
	hostname: string;
	port: string;
	explicitScheme: boolean;
};

function parseLinkParts(value: string): LinkParts | null {
	const explicitScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
	const withScheme = explicitScheme
		? value
		: value.startsWith("//")
			? `https:${value}`
			: `https://${value}`;
	try {
		const parsed = new URL(withScheme);
		const hostname = parsed.hostname
			.toLowerCase()
			.replace(/\.+$/, "")
			.replace(/^www\./, "");
		if (!hostname) return null;
		return {
			explicitScheme,
			hostname,
			port: parsed.port,
			protocol: parsed.protocol,
		};
	} catch {
		return null;
	}
}

/**
 * A link is deceptive when its visible text reads as a URL that does not
 * match the real destination — the one shape where a click genuinely
 * surprises the user. Only those links get the confirmation dialog;
 * ordinary external links open directly. The label and destination must
 * agree on hostname and port, and on scheme when the label states one.
 */
function isDeceptiveLink(children: ReactNode, url: string): boolean {
	const text = extractLinkText(children).trim();
	if (!text || !urlLikeTextPattern.test(text)) return false;
	const textParts = parseLinkParts(text);
	if (!textParts) return false;
	const urlParts = parseLinkParts(url);
	if (!urlParts) return true;
	return (
		textParts.hostname !== urlParts.hostname ||
		textParts.port !== urlParts.port ||
		(textParts.explicitScheme && textParts.protocol !== urlParts.protocol)
	);
}

function SafeMarkdownLink({
	children,
	className,
	href,
	node: _node,
	rel: _rel,
	target: _target,
	title,
	...props
}: MarkdownLinkProps) {
	const [isOpen, setIsOpen] = useState(false);
	const isIncomplete = href === "streamdown:incomplete-link";
	const url = isIncomplete ? undefined : href;

	if (!url) {
		return (
			<span
				className={className}
				data-incomplete={isIncomplete}
				data-streamdown="link"
			>
				{children}
			</span>
		);
	}

	const isAppLink =
		url.startsWith("#") ||
		(url.startsWith("/") && !url.startsWith("//")) ||
		url.startsWith("./") ||
		url.startsWith("../") ||
		(!/^[a-z][a-z\d+.-]*:/i.test(url) && !url.startsWith("//"));

	if (isAppLink) {
		return (
			<a
				{...props}
				className={`wrap-anywhere font-medium text-primary underline ${className ?? ""}`}
				data-streamdown="link"
				href={url}
				title={title}
			>
				{children}
			</a>
		);
	}

	// Streamdown's harden step only lets http(s), mailto, tel, and
	// protocol-relative URLs reach this component, matching the sidecar's
	// open_external_url allowlist. Protocol-relative URLs fail the sidecar's
	// `new URL()` parse, so pin them to https before handing them off.
	const externalUrl = url.startsWith("//") ? `https:${url}` : url;
	const openExternally = () => void openExternalUrl(externalUrl);

	if (!isDeceptiveLink(children, externalUrl)) {
		const openDirectly = (event: MouseEvent<HTMLAnchorElement>) => {
			event.preventDefault();
			openExternally();
		};
		return (
			<a
				{...props}
				className={`wrap-anywhere font-medium text-primary underline ${className ?? ""}`}
				data-streamdown="link"
				href={externalUrl}
				onAuxClick={(event) => {
					if (event.button === 1) openDirectly(event);
				}}
				onClick={openDirectly}
				rel="noreferrer"
				title={title ?? externalUrl}
			>
				{children}
			</a>
		);
	}

	const openConfirmation = (event: MouseEvent<HTMLAnchorElement>) => {
		event.preventDefault();
		setIsOpen(true);
	};
	const confirmMiddleClick = (event: MouseEvent<HTMLAnchorElement>) => {
		if (event.button === 1) openConfirmation(event);
	};

	return (
		<>
			{/* biome-ignore lint/a11y/useValidAnchor: External Markdown retains native link semantics while confirmation withholds the live destination. */}
			<a
				{...props}
				aria-haspopup="dialog"
				className={`wrap-anywhere font-medium text-primary underline ${className ?? ""}`}
				data-streamdown="link"
				href="#confirm-external-link"
				onAuxClick={confirmMiddleClick}
				onClick={openConfirmation}
				title={title ?? externalUrl}
			>
				{children}
			</a>
			<MarkdownLinkSafetyModal
				isOpen={isOpen}
				onClose={() => setIsOpen(false)}
				onConfirm={openExternally}
				url={externalUrl}
			/>
		</>
	);
}

type MarkdownImageProps =
	| (ComponentProps<"img"> & ExtraProps)
	| (Record<string, unknown> & ExtraProps);

const remoteImagePattern = /^(?:https?:)?[\\/]{2}/i;

function isSafeMarkdownImageSource(source: string): boolean {
	const normalized = source.trim();
	if (!normalized || remoteImagePattern.test(normalized)) return false;

	// Streamdown's hardened URL policy accepts app-root paths. Keeping the rule
	// this narrow prevents model-authored Markdown from making hidden requests.
	return normalized.startsWith("/");
}

function MarkdownImage({ alt, height, src, title, width }: MarkdownImageProps) {
	const label = typeof alt === "string" ? alt.trim() : "";
	const source = typeof src === "string" ? src.trim() : "";

	if (source && isSafeMarkdownImageSource(source)) {
		return (
			// biome-ignore lint/performance/noImgElement: Markdown can reference runtime app assets that Next Image cannot statically optimize.
			<img
				alt={label}
				className="my-4 max-w-full rounded-lg"
				data-streamdown="image"
				height={typeof height === "number" ? height : undefined}
				loading="lazy"
				src={source}
				title={typeof title === "string" ? title : undefined}
				width={typeof width === "number" ? width : undefined}
			/>
		);
	}

	return (
		<span data-streamdown="blocked-image" role="note">
			出于隐私已拦截外部图片{label ? `：${label}` : ""}
		</span>
	);
}

const markdownComponents = {
	a: SafeMarkdownLink,
	img: MarkdownImage,
} satisfies Components;

export const MemoizedMarkdown = memo(
	({
		content,
		classNames,
		streaming = false,
	}: {
		content: string;
		streaming?: boolean;
		classNames?: string;
	}) => (
		<Streamdown
			className={cn("cline-markdown", classNames)}
			components={markdownComponents}
			controls={agentMarkdownControls}
			dir="auto"
			isAnimating={streaming}
			lineNumbers={false}
			mode={streaming ? "streaming" : "static"}
			normalizeHtmlIndentation
			parseIncompleteMarkdown={streaming}
			plugins={streamdownPlugins}
			translations={streamdownTranslations}
		>
			{content}
		</Streamdown>
	),
);

MemoizedMarkdown.displayName = "MemoizedMarkdown";
