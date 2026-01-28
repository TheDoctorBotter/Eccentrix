'use client';

import { useCallback, useEffect } from 'react';
import { useEditor, EditorContent, JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorToolbar } from './EditorToolbar';
import { RichTextDocument } from '@/lib/rich-text/types';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  /** Initial content as TipTap JSON document */
  content: RichTextDocument;
  /** Callback when content changes */
  onUpdate?: (content: RichTextDocument) => void;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Additional CSS classes for the container */
  className?: string;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Minimum height for the editor */
  minHeight?: string;
  /** Show or hide the toolbar */
  showToolbar?: boolean;
}

/**
 * Rich Text Editor for clinical notes
 *
 * Built on TipTap/ProseMirror, this editor provides:
 * - Formatted text editing (bold, italic, underline)
 * - Section headers (H2, H3)
 * - Bullet and numbered lists
 * - Clean export to Word and PDF
 *
 * The editor uses a JSON document model that is:
 * - Format-safe (no markdown artifacts)
 * - Easily convertible to DOCX, PDF, HTML
 * - Suitable for medical/legal documentation
 */
export function RichTextEditor({
  content,
  onUpdate,
  readOnly = false,
  className,
  placeholder = 'Begin typing your note...',
  minHeight = '400px',
  showToolbar = true,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Use built-in heading, but limit to h2, h3 for clinical docs
        heading: {
          levels: [2, 3],
        },
      }),
      Underline,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: content as JSONContent,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      if (onUpdate) {
        const json = editor.getJSON() as RichTextDocument;
        onUpdate(json);
      }
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-slate max-w-none focus:outline-none',
          // Clinical document styling
          'prose-headings:font-bold prose-headings:text-slate-900',
          'prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-2 prose-h2:uppercase prose-h2:tracking-wide',
          'prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2',
          'prose-p:text-slate-800 prose-p:leading-relaxed prose-p:my-2',
          'prose-ul:my-2 prose-ol:my-2',
          'prose-li:my-0.5',
          // Remove default prose margins that cause extra spacing
          '[&>*:first-child]:mt-0'
        ),
      },
    },
  });

  // Update content when it changes externally
  useEffect(() => {
    if (editor && content) {
      const currentContent = JSON.stringify(editor.getJSON());
      const newContent = JSON.stringify(content);
      if (currentContent !== newContent) {
        editor.commands.setContent(content as JSONContent);
      }
    }
  }, [editor, content]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly]);

  return (
    <div className={cn('border rounded-lg bg-white overflow-hidden', className)}>
      {showToolbar && !readOnly && (
        <EditorToolbar editor={editor} disabled={readOnly} />
      )}
      <div
        className={cn(
          'px-6 py-4 overflow-auto',
          readOnly && 'bg-slate-50'
        )}
        style={{ minHeight }}
      >
        <EditorContent
          editor={editor}
          className={cn(
            // Editor container styling
            '[&_.ProseMirror]:min-h-[inherit]',
            '[&_.ProseMirror]:outline-none',
            // Placeholder styling
            '[&_.is-editor-empty]:before:content-[attr(data-placeholder)]',
            '[&_.is-editor-empty]:before:text-slate-400',
            '[&_.is-editor-empty]:before:float-left',
            '[&_.is-editor-empty]:before:pointer-events-none',
            '[&_.is-editor-empty]:before:h-0'
          )}
        />
      </div>
    </div>
  );
}

/**
 * Hook to get editor instance for external control
 */
export function useRichTextEditor(
  initialContent: RichTextDocument,
  options?: {
    readOnly?: boolean;
    onUpdate?: (content: RichTextDocument) => void;
  }
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
    ],
    content: initialContent as JSONContent,
    editable: !options?.readOnly,
    onUpdate: ({ editor }) => {
      if (options?.onUpdate) {
        options.onUpdate(editor.getJSON() as RichTextDocument);
      }
    },
  });

  const getContent = useCallback((): RichTextDocument | null => {
    if (!editor) return null;
    return editor.getJSON() as RichTextDocument;
  }, [editor]);

  const setContent = useCallback(
    (content: RichTextDocument) => {
      if (editor) {
        editor.commands.setContent(content as JSONContent);
      }
    },
    [editor]
  );

  const getHTML = useCallback((): string => {
    if (!editor) return '';
    return editor.getHTML();
  }, [editor]);

  const getText = useCallback((): string => {
    if (!editor) return '';
    return editor.getText();
  }, [editor]);

  return {
    editor,
    getContent,
    setContent,
    getHTML,
    getText,
  };
}
