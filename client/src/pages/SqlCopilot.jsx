import { useState } from 'react';
import axios from 'axios';
import { Terminal, Play, Sparkles, Database, ShieldAlert, Download } from 'lucide-react';

const API = '/api';

const PRESET_QUERIES = [
    'Show all active shipments with origin, destination, vehicle plate, and live cargo temperature',
    'Which vehicles have the highest payload capacity utilization percentage right now?',
    'List all cold-chain temperature excursions and SLA breach alerts',
];

export default function SqlCopilot() {
    const [question, setQuestion] = useState(PRESET_QUERIES[0]);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const runQuery = async (customQuestion) => {
        const q = typeof customQuestion === 'string' ? customQuestion : question;
        if (!q.trim()) return;
        setQuestion(q);
        setLoading(true);
        setError('');
        try {
            const { data } = await axios.post(`${API}/copilot/query`, { question: q });
            setResult(data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to execute query');
        } finally {
            setLoading(false);
        }
    };

    const exportQueryCsv = () => {
        if (!result?.rows?.length) return;
        const cols = Object.keys(result.rows[0]);
        const lines = [
            cols.join(','),
            ...result.rows.map((row) =>
                cols.map((c) => `"${String(row[c] ?? '').replace(/"/g, '""')}"`).join(',')
            ),
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fleetpulse-audit-query-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const columns = result?.rows?.length ? Object.keys(result.rows[0]) : [];

    return (
        <div className="page-container">
            <div style={{ marginBottom: '1.5rem' }}>
                <h1 style={{ fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                    Live Fleet SQL Operations Copilot
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                    Ask operational questions in plain English—compiled into strictly validated read-only <span className="mono">SELECT</span> queries against live PostgreSQL telemetry.
                </p>
            </div>

            {/* Query Console Panel */}
            <div className="panel" style={{ marginBottom: '1.5rem' }}>
                <div className="panel-header">
                    <div className="panel-title">
                        <Terminal size={17} color="#f97316" />
                        Natural-Language to PostgreSQL Query Console
                    </div>
                    <span className="badge badge-emerald">SELECT-Only Guard Active</span>
                </div>

                <div style={{ padding: '1.3rem' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                        {PRESET_QUERIES.map((preset, i) => (
                            <button
                                key={i}
                                type="button"
                                className="btn btn-ghost"
                                style={{ fontSize: '0.78rem', padding: '0.42rem 0.8rem' }}
                                onClick={() => runQuery(preset)}
                            >
                                <Sparkles size={13} color="#f97316" />
                                {preset}
                            </button>
                        ))}
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            runQuery();
                        }}
                        style={{ display: 'flex', gap: '0.75rem' }}
                    >
                        <input
                            type="text"
                            className="form-input"
                            style={{ flex: 1 }}
                            placeholder="Ask about active freight corridors, cold-chain temperatures, or truck capacity..."
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                        />
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            <Play size={16} />
                            {loading ? 'Executing...' : 'Run Query'}
                        </button>
                    </form>

                    {error && (
                        <div
                            className="telemetry-card breached"
                            style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fda4af' }}
                        >
                            <ShieldAlert size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    {result && (
                        <div style={{ marginTop: '1.25rem' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.45rem', display: 'flex', justifyContent: 'space-between' }}>
                                <span>GENERATED POSTGRESQL STATEMENT</span>
                                <span className="mono" style={{ color: '#bef264' }}>{result.explanation}</span>
                            </div>
                            <pre className="sql-box">{result.sql}</pre>
                        </div>
                    )}
                </div>
            </div>

            {/* Query Results Table */}
            {result && (
                <div className="panel">
                    <div className="panel-header">
                        <div className="panel-title">
                            <Database size={17} color="#a3e635" />
                            Live Telemetry Result Set ({result.rowCount} rows)
                        </div>
                        {result.rows.length > 0 && (
                            <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                                onClick={exportQueryCsv}
                            >
                                <Download size={14} color="#f97316" />
                                Export CSV
                            </button>
                        )}
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        {result.rows.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                Query executed cleanly and returned 0 rows.
                            </div>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        {columns.map((col) => (
                                            <th key={col} className="mono">{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.rows.map((row, rIdx) => (
                                        <tr key={rIdx}>
                                            {columns.map((col) => (
                                                <td key={col} className="mono" style={{ fontSize: '0.8rem' }}>
                                                    {row[col] === null ? 'NULL' : String(row[col])}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}