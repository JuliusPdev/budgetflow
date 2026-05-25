interface Props {
  parseError: string | null;
  rowCount: number;
  onFile: (file: File) => void;
}

export default function ImportFileStep({ parseError, rowCount, onFile }: Props) {
  return (
    <div className="csv-step">
      <p className="csv-step-intro">
        Export your transactions from C24 Bank as a CSV, then upload the file here.
        Only <strong>.csv</strong> files are accepted.
      </p>
      <label className="csv-upload-zone">
        <input
          type="file"
          accept=".csv,text/csv"
          className="csv-upload-input"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
        <span className="csv-upload-label">Choose CSV file</span>
      </label>
      {parseError && <p className="csv-error" role="alert">{parseError}</p>}
      {rowCount > 0 && (
        <p className="csv-hint">Parsed {rowCount} rows successfully.</p>
      )}
    </div>
  );
}
