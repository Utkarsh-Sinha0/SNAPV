export type EditorTool = 'arrow' | 'text' | 'highlight' | 'blur';

type AnnotationToolbarProps = {
  activeTool: EditorTool;
  setActiveTool: (tool: EditorTool) => void;
};

const TOOL_OPTIONS: Array<{ value: EditorTool; label: string }> = [
  { value: 'arrow', label: 'Arrow' },
  { value: 'text', label: 'Text' },
  { value: 'highlight', label: 'Highlight' },
  { value: 'blur', label: 'Blur' },
];

export function AnnotationToolbar({
  activeTool,
  setActiveTool,
}: AnnotationToolbarProps) {
  return (
    <section className="editor-panel">
      <div className="section-header">
        <p className="eyebrow">Annotate</p>
        <h2>Markup tools</h2>
      </div>
      <div className="toolbar-row" role="toolbar" aria-label="Annotation tools">
        {TOOL_OPTIONS.map((tool) => {
          const selected = activeTool === tool.value;

          return (
            <button
              key={tool.value}
              type="button"
              className={selected ? 'tool-button active' : 'tool-button'}
              aria-pressed={selected}
              onClick={() => setActiveTool(tool.value)}
            >
              {tool.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
