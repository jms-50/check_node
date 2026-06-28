import { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, Shield, Server, List, Trash2, Plus } from 'lucide-react';
import './index.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/admin';
const ADMIN_API_KEY = import.meta.env.VITE_ADMIN_API_KEY as string | undefined;
const adminClient = axios.create({
  baseURL: API_BASE,
  headers: ADMIN_API_KEY ? { 'X-Admin-API-Key': ADMIN_API_KEY } : undefined,
});

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [slaves, setSlaves] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [policy, setPolicy] = useState<{ blocked_urls: string[]; blocked_processes: string[] }>({
    blocked_urls: [],
    blocked_processes: []
  });

  const [newUrl, setNewUrl] = useState('');
  const [newProcess, setNewProcess] = useState('');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [slavesRes, eventsRes, policyRes] = await Promise.all([
        adminClient.get('/slaves'),
        adminClient.get('/events'),
        adminClient.get('/policy')
      ]);
      setSlaves(slavesRes.data);
      setEvents(eventsRes.data);
      setPolicy(policyRes.data);
    } catch (error) {
      console.error('Failed to fetch data', error);
    }
  };

  const updatePolicy = async (newPolicy: any) => {
    try {
      await adminClient.post('/policy', newPolicy);
      fetchData();
    } catch (error) {
      console.error('Failed to update policy', error);
    }
  };

  const handleAddUrl = () => {
    if (!newUrl) return;
    const updated = { ...policy, blocked_urls: [...policy.blocked_urls, newUrl] };
    updatePolicy(updated);
    setNewUrl('');
  };

  const handleRemoveUrl = (url: string) => {
    const updated = { ...policy, blocked_urls: policy.blocked_urls.filter(u => u !== url) };
    updatePolicy(updated);
  };

  const handleAddProcess = () => {
    if (!newProcess) return;
    const updated = { ...policy, blocked_processes: [...policy.blocked_processes, newProcess] };
    updatePolicy(updated);
    setNewProcess('');
  };

  const handleRemoveProcess = (proc: string) => {
    const updated = { ...policy, blocked_processes: policy.blocked_processes.filter(p => p !== proc) };
    updatePolicy(updated);
  };

  const isOnline = (lastHeartbeat: string) => {
    if (!lastHeartbeat) return false;
    const diff = new Date().getTime() - new Date(lastHeartbeat).getTime();
    return diff < 60000; // 60 seconds
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <Shield size={28} />
          <span>CheckNode</span>
        </div>
        <div className="nav-menu">
          <a className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
            <Activity size={20} /> Overview
          </a>
          <a className={`nav-item ${activeTab === 'slaves' ? 'active' : ''}`} onClick={() => setActiveTab('slaves')}>
            <Server size={20} /> Slaves
          </a>
          <a className={`nav-item ${activeTab === 'policy' ? 'active' : ''}`} onClick={() => setActiveTab('policy')}>
            <Shield size={20} /> Policies
          </a>
          <a className={`nav-item ${activeTab === 'events' ? 'active' : ''}`} onClick={() => setActiveTab('events')}>
            <List size={20} /> Event Logs
          </a>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="header">
          <div className="page-title">
            {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
          </div>
        </div>
        
        <div className="content">
          {activeTab === 'overview' && (
            <div>
              <div className="grid-cards">
                <div className="card">
                  <div className="card-title">Total Slaves</div>
                  <div className="stat-value">{slaves.length}</div>
                </div>
                <div className="card">
                  <div className="card-title">Online Slaves</div>
                  <div className="stat-value">{slaves.filter(s => isOnline(s.last_heartbeat)).length}</div>
                </div>
                <div className="card">
                  <div className="card-title">Total Block Events</div>
                  <div className="stat-value">{events.length}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'slaves' && (
            <div className="card">
              <div className="card-title">Registered Slaves</div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Slave ID</th>
                      <th>Hostname</th>
                      <th>IP Address</th>
                      <th>OS Version</th>
                      <th>Last Heartbeat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slaves.map(slave => (
                      <tr key={slave.id}>
                        <td>
                          {isOnline(slave.last_heartbeat) 
                            ? <span className="status-badge online">Online</span> 
                            : <span className="status-badge offline">Offline</span>}
                        </td>
                        <td>{slave.id}</td>
                        <td>{slave.hostname}</td>
                        <td>{slave.ip_address || '-'}</td>
                        <td>{slave.os_version}</td>
                        <td>{new Date(slave.last_heartbeat).toLocaleString()}</td>
                      </tr>
                    ))}
                    {slaves.length === 0 && (
                      <tr><td colSpan={6} style={{textAlign: 'center', padding: '32px'}}>No slaves registered</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'policy' && (
            <div className="grid-cards">
              <div className="card">
                <div className="card-title">Blocked URLs</div>
                <div className="form-group">
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Enter domain (e.g. youtube.com)" 
                    value={newUrl}
                    onChange={e => setNewUrl(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleAddUrl()}
                  />
                  <button className="btn btn-primary" onClick={handleAddUrl}>
                    <Plus size={18} /> Add
                  </button>
                </div>
                <div style={{border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)'}}>
                  {policy.blocked_urls.map(url => (
                    <div className="list-item" key={url}>
                      <span>{url}</span>
                      <button className="btn btn-danger" style={{padding: '8px'}} onClick={() => handleRemoveUrl(url)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {policy.blocked_urls.length === 0 && (
                    <div className="list-item" style={{justifyContent: 'center', color: 'var(--text-light)'}}>No URLs blocked</div>
                  )}
                </div>
              </div>

              <div className="card">
                <div className="card-title">Blocked Processes</div>
                <div className="form-group">
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Enter process name (e.g. KakaoTalk.exe)" 
                    value={newProcess}
                    onChange={e => setNewProcess(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleAddProcess()}
                  />
                  <button className="btn btn-primary" onClick={handleAddProcess}>
                    <Plus size={18} /> Add
                  </button>
                </div>
                <div style={{border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)'}}>
                  {policy.blocked_processes.map(proc => (
                    <div className="list-item" key={proc}>
                      <span>{proc}</span>
                      <button className="btn btn-danger" style={{padding: '8px'}} onClick={() => handleRemoveProcess(proc)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {policy.blocked_processes.length === 0 && (
                    <div className="list-item" style={{justifyContent: 'center', color: 'var(--text-light)'}}>No processes blocked</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'events' && (
            <div className="card">
              <div className="card-title">Event Logs</div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Slave ID</th>
                      <th>Type</th>
                      <th>Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map(event => (
                      <tr key={event.id}>
                        <td>{new Date(event.timestamp * 1000).toLocaleString()}</td>
                        <td>{event.slave_id}</td>
                        <td>{event.type}</td>
                        <td>{event.target}</td>
                      </tr>
                    ))}
                    {events.length === 0 && (
                      <tr><td colSpan={4} style={{textAlign: 'center', padding: '32px'}}>No events recorded</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
