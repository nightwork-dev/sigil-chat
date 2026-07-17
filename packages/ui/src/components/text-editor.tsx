import { useEffect } from "react";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { cn } from "@workspace/ui/lib/utils";

export interface TextEditorProps {
  "aria-label"?: string;
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  onBlur?: () => void;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

export function textEditorDocument(value: string): JSONContent {
  const lines = value.split("\n");
  const content = lines.flatMap((line, index) => [
    ...(index > 0 ? [{ type: "hardBreak" }] : []),
    ...(line ? [{ type: "text", text: line }] : []),
  ]);
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: content.length > 0 ? content : undefined,
      },
    ],
  };
}

export function TextEditor({
  "aria-label": ariaLabel = "Text editor",
  autoFocus = false,
  className,
  disabled = false,
  onBlur,
  onChange,
  placeholder = "Start writing…",
  value,
}: TextEditorProps) {
  const editor = useEditor({
    content: textEditorDocument(value),
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        orderedList: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    immediatelyRender: false,
    onCreate: ({ editor: instance }) => {
      if (autoFocus) instance.commands.focus("end");
    },
    onBlur,
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getText({ blockSeparator: "\n\n" }));
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getText({ blockSeparator: "\n\n" });
    if (current === value) return;
    editor.commands.setContent(textEditorDocument(value), {
      emitUpdate: false,
    });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  return (
    <EditorContent
      aria-label={ariaLabel}
      className={cn(
        "min-h-32 rounded-md border border-input bg-background text-sm leading-relaxed text-foreground transition-colors",
        "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25",
        "[&_.ProseMirror]:min-h-32 [&_.ProseMirror]:px-3 [&_.ProseMirror]:py-2.5 [&_.ProseMirror]:outline-none",
        "[&_.ProseMirror_p]:my-0 [&_.ProseMirror_p+p]:mt-3",
        "[&_.is-editor-empty:first-child::before]:pointer-events-none [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:text-muted-foreground [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
      editor={editor}
    />
  );
}
