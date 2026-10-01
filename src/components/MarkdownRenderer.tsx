import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownRendererProps {
  content: string;
}

function autoFormatCode(text: string): string {
  if (!text) return '';
  if (text.includes('```')) return text;
  
  const codeIndicators = [
    'function ', 'def ', 'class ', 'import ', '#include', 
    'public static', '<?php', 'const ', 'let ', 'var ', '=>', 'System.out.'
  ];
  const hasBraces = text.includes('{') && text.includes('}');
  const hasIndent = /^\s{2,}/m.test(text);
  const hasSemicolon = text.includes(';');
  
  const indicatorCount = codeIndicators.filter(ind => text.includes(ind)).length;
  const isLikelyCode = indicatorCount >= 1 || (hasBraces && (hasIndent || hasSemicolon));
  
  if (isLikelyCode) {
     return `\`\`\`javascript\n${text}\n\`\`\``; // Defaulting to javascript/c-like highlighting
  }
  return text;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const processedContent = autoFormatCode(content);

  return (
    <div className="markdown-body space-y-3 text-base leading-relaxed text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const isBlock = match || String(children).includes('\n');
            
            if (isBlock) {
              return (
                <div className="my-3 overflow-hidden rounded-lg border border-line">
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={match ? match[1] : 'javascript'}
                    PreTag="div"
                    wrapLongLines
                    codeTagProps={{ style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }}
                    className="!m-0 !p-4 !text-sm"
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              );
            }
            
            // Inline code snippet
            return (
              <code className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[0.9em] text-ink" {...props}>
                {children}
              </code>
            );
          },
          // Customize paragraphs and links for cyber aesthetic
          p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
          a: ({ node, ...props }) => <a className="text-accent underline underline-offset-2 transition-colors hover:text-primary" {...props} />,
          ul: ({ node, ...props }) => <ul className="mb-2 list-disc space-y-1 pl-5" {...props} />,
          ol: ({ node, ...props }) => <ol className="mb-2 list-decimal space-y-1 pl-5" {...props} />,
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
