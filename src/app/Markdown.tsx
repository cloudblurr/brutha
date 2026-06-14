"use client";

import { memo, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check } from "./icons";

function CodeBlock({
  language,
  children,
}: {
  language: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    // Extract raw text from the rendered code node.
    const text = extractText(children);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{language || "code"}</span>
        <button type="button" className="copy-btn" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: React.ReactNode } }).props;
    return extractText(props?.children);
  }
  return "";
}

function MarkdownImpl({ content }: { content: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          // react-markdown wraps fenced code in <pre><code>. We hoist our
          // styled wrapper to <pre> and read the language off the <code>.
          pre({ children }) {
            const child = Array.isArray(children) ? children[0] : children;
            let language = "";
            let codeChildren: React.ReactNode = children;
            if (
              child &&
              typeof child === "object" &&
              "props" in child &&
              child.props
            ) {
              const props = child.props as {
                className?: string;
                children?: React.ReactNode;
              };
              const m = /language-(\w+)/.exec(props.className ?? "");
              if (m) language = m[1];
              if (props.children !== undefined) codeChildren = props.children;
            }
            return <CodeBlock language={language}>{codeChildren}</CodeBlock>;
          },
          code({ className, children, ...props }: ComponentPropsWithoutRef<"code">) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          a({ children, ...props }) {
            return (
              <a target="_blank" rel="noreferrer noopener" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
