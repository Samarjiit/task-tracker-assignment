import { FormEvent, useEffect, useState } from 'react';
import { api, Project, Task, UserDto } from '../api';

const STATUSES: Task['status'][] = [
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
  'BLOCKED',
];

// Mirror of the server-side state machine (for showing transition buttons).
const TRANSITIONS: Record<Task['status'], Task['status'][]> = {
  TODO: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['IN_REVIEW', 'BLOCKED'],
  IN_REVIEW: ['DONE', 'IN_PROGRESS', 'BLOCKED'],
  BLOCKED: ['IN_PROGRESS', 'TODO'],
  DONE: [],
};

export default function Board({ onLogout }: { onLogout: () => void }) {
  const [me, setMe] = useState<UserDto | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [error, setError] = useState('');

  // create-task form
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<Task['priority']>('MEDIUM');

  const canManage = me?.role === 'ADMIN' || me?.role === 'MANAGER';

  const load = async () => {
    setError('');
    try {
      const [meRes, taskRes, projRes] = await Promise.all([
        api.get('/users/me'),
        api.get('/tasks', { params: { limit: 100 } }),
        api.get('/projects'),
      ]);
      setMe(meRes.data);
      setTasks(taskRes.data.data);
      setProjects(projRes.data);
      if (projRes.data[0]) setProjectId((p) => p || projRes.data[0].id);
      if (meRes.data.role !== 'MEMBER') {
        const u = await api.get('/users');
        setUsers(u.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to load');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createTask = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/tasks', {
        title,
        projectId,
        priority,
        ...(assigneeId ? { assigneeId } : {}),
      });
      setTitle('');
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Create failed');
    }
  };

  const advance = async (id: string, status: Task['status']) => {
    setError('');
    try {
      await api.patch(`/tasks/${id}/status`, { status });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Transition failed');
    }
  };

  return (
    <>
      <header>
        <strong>Task Board {me ? `· ${me.name} (${me.role})` : ''}</strong>
        <button className="secondary" onClick={onLogout}>
          Logout
        </button>
      </header>

      {canManage && (
        <form className="row" onSubmit={createTask} style={{ padding: '12px 20px' }}>
          <input
            style={{ flex: 2 }}
            placeholder="New task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <select
            style={{ flex: 1 }}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            style={{ flex: 1 }}
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Task['priority'])}
          >
            <option>LOW</option>
            <option>MEDIUM</option>
            <option>HIGH</option>
          </select>
          <button type="submit">Add</button>
        </form>
      )}

      {error && <div className="err" style={{ padding: '0 20px' }}>{error}</div>}

      <div className="board">
        {STATUSES.map((status) => (
          <div className="column" key={status}>
            <h3>
              {status} ({tasks.filter((t) => t.status === status).length})
            </h3>
            {tasks
              .filter((t) => t.status === status)
              .map((t) => (
                <div className="task" key={t.id}>
                  <div className="title">{t.title}</div>
                  <span className={`badge ${t.priority}`}>{t.priority}</span>
                  <div className="transitions">
                    {TRANSITIONS[t.status].map((next) => (
                      <button key={next} onClick={() => advance(t.id, next)}>
                        → {next}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
    </>
  );
}
