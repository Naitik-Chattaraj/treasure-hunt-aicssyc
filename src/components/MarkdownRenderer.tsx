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
    <div className="markdown-body text-sm font-mono leading-relaxed space-y-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const isBlock = match || String(children).includes('\n');
            
            if (isBlock) {
              return (
                <div className="rounded border border-cyber-border overflow-hidden my-4 shadow-[0_0_15px_rgba(0,240,255,0.1)]">
                  <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={match ? match[1] : 'javascript'}
                    PreTag="div"
                    className="!bg-black !m-0 !p-4 !text-sm"
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
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
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
