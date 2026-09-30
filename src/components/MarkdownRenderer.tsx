import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body text-sm font-mono leading-relaxed space-y-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            
            // Render block code with syntax highlighting
            if (!inline && match) {
              return (
                <div className="rounded border border-cyber-border overflow-hidden my-4 shadow-[0_0_15px_rgba(0,240,255,0.1)]">
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={match[1]}
                    PreTag="div"
                    className="!bg-black !m-0 !p-4 !text-sm"
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              );
            }
            
            // Fallback for code blocks without a specified language
            if (!inline && !match) {
              return (
                <div className="rounded border border-cyber-border overflow-hidden my-4 shadow-[0_0_15px_rgba(0,240,255,0.1)] bg-black p-4">
                  <code className="text-gray-300 block whitespace-pre overflow-x-auto" {...props}>
                    {children}
                  </code>
                </div>
              );
            }

            // Inline code snippet
            return (
              <code className="bg-black text-cyber-cyan border border-cyber-border/50 px-1.5 py-0.5 rounded text-xs" {...props}>
                {children}
              </code>
            );
          },
          // Customize paragraphs and links for cyber aesthetic
          p: ({ node, ...props }) => <p className="mb-2" {...props} />,
          a: ({ node, ...props }) => <a className="text-cyber-cyan hover:text-cyber-yellow transition-colors underline" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc list-inside space-y-1 mb-2" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal list-inside space-y-1 mb-2" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
