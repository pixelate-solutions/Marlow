import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a({ children, href }) {
    const external = /^https?:\/\//i.test(href ?? "");
    return (
      <a
        href={href}
        rel={external ? "noreferrer noopener" : undefined}
        target={external ? "_blank" : undefined}
      >
        {children}
      </a>
    );
  },
};

export function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="message__markdown">
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}
