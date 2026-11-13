import { useEffect, useRef, useState } from 'react';

async function api(path, method = 'GET', body) {
  const token = localStorage.getItem('token');
  const res = await fetch('/api' + path, {
    method,
    headers: {
      ...(body && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: 'Bearer ' + token }),
    },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '요청에 실패했습니다.');
  return data;
}

const fmt = (d) => (d ? new Date(d).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');

function Avatar({ id, name }) {
  return (
    <span className="avatar" style={{ background: `hsl(${(id * 67) % 360} 55% 45%)` }}>
      {name[0]}
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="닫기">✕</button>
        </header>
        {children}
      </div>
    </div>
  );
}

// 로그인 / 회원가입
function AuthModal({ mode, setMode, onDone, onClose }) {
  const [form, setForm] = useState({ username: '', password: '', nickname: '' });
  const [error, setError] = useState('');
  const signup = mode === 'signup';
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    try {
      const { token } = await api(signup ? '/signup' : '/login', 'POST', form);
      localStorage.setItem('token', token);
      onDone();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal title={signup ? '회원가입' : '로그인'} onClose={onClose}>
      <form onSubmit={submit}>
        <label>아이디<input value={form.username} onChange={set('username')} autoFocus required /></label>
        <label>비밀번호<input type="password" value={form.password} onChange={set('password')} required /></label>
        {signup && <label>닉네임<input value={form.nickname} onChange={set('nickname')} maxLength={20} required /></label>}
        {error && <p className="error">{error}</p>}
        <button className="primary">{signup ? '가입하기' : '로그인'}</button>
        <button type="button" className="link" onClick={() => { setError(''); setMode(signup ? 'login' : 'signup'); }}>
          {signup ? '이미 계정이 있어요 → 로그인' : '계정이 없어요 → 회원가입'}
        </button>
      </form>
    </Modal>
  );
}

// 마이페이지: 프로필 조회 / 수정 / 탈퇴
function ProfileModal({ me, onSaved, onDeleted, onClose }) {
  const [form, setForm] = useState({ nickname: me.nickname, status_msg: me.status_msg, password: '' });
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    try {
      onSaved(await api('/me', 'PUT', form));
      setForm((f) => ({ ...f, password: '' }));
      setMsg('저장되었습니다.');
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function withdraw() {
    if (!confirm('정말 탈퇴할까요? 작성한 메시지도 모두 삭제됩니다.')) return;
    await api('/me', 'DELETE');
    onDeleted();
  }

  return (
    <Modal title="마이페이지" onClose={onClose}>
      <form onSubmit={save}>
        <p className="meta">아이디 <b>{me.username}</b> · 가입일 {fmt(me.created_at)}</p>
        <label>닉네임<input value={form.nickname} onChange={set('nickname')} maxLength={20} required /></label>
        <label>상태 메시지<input value={form.status_msg} onChange={set('status_msg')} maxLength={100} placeholder="예: 수행평가 하는 중" /></label>
        <label>새 비밀번호<input type="password" value={form.password} onChange={set('password')} placeholder="바꿀 때만 입력" /></label>
        {msg && <p className="meta">{msg}</p>}
        <button className="primary">저장</button>
        <button type="button" className="danger" onClick={withdraw}>회원 탈퇴</button>
      </form>
    </Modal>
  );
}

// JOIN 조회 메뉴: 멤버별 활동
function Members() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/members').then(setRows).catch(() => {}); }, []);
  return (
    <div className="members">
      <table>
        <thead>
          <tr><th>멤버</th><th>상태 메시지</th><th>메시지 수</th><th>마지막 활동</th><th>가입일</th></tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id}>
              <td><Avatar id={u.id} name={u.nickname} /> {u.nickname} <span className="meta">@{u.username}</span></td>
              <td>{u.status_msg || '-'}</td>
              <td>{u.message_count}</td>
              <td>{fmt(u.last_message_at)}</td>
              <td>{fmt(u.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="empty">아직 가입한 멤버가 없어요.</p>}
    </div>
  );
}

function Chat({ channel, me, onNeedLogin }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [edit, setEdit] = useState(null); // { id, content }
  const bottom = useRef(null);

  const load = () => api('/messages?channel=' + encodeURIComponent(channel)).then(setMessages).catch(() => {});

  useEffect(() => {
    setMessages([]);
    load();
    // ponytail: 3초 폴링. 실시간이 필요해지면 WebSocket(socket.io)으로 교체
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [channel]);

  useEffect(() => { bottom.current?.scrollIntoView(); }, [messages.length]);

  const run = (p) => p.then(load).catch((err) => alert(err.message));

  function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    run(api('/messages', 'POST', { channel, content: text }));
    setText('');
  }

  function saveEdit(e) {
    e.preventDefault();
    run(api('/messages/' + edit.id, 'PUT', { content: edit.content }));
    setEdit(null);
  }

  const onEnter = (submit) => (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
  };

  return (
    <>
      <div className="messages">
        {!messages.length && <p className="empty"># {channel} 채널의 첫 메시지를 남겨보세요.</p>}
        {messages.map((m) => (
          <div className="message" key={m.id}>
            <Avatar id={m.user_id} name={m.nickname} />
            <div className="body">
              <div>
                <b>{m.nickname}</b>
                {m.status_msg && <span className="status">{m.status_msg}</span>}
                <span className="meta">{fmt(m.created_at)}{m.updated_at && ' (수정됨)'}</span>
              </div>
              {edit?.id === m.id ? (
                <form className="edit" onSubmit={saveEdit}>
                  <textarea value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} onKeyDown={onEnter(saveEdit)} autoFocus />
                  <button className="primary">저장</button>
                  <button type="button" onClick={() => setEdit(null)}>취소</button>
                </form>
              ) : (
                <p>{m.content}</p>
              )}
            </div>
            {me?.id === m.user_id && edit?.id !== m.id && (
              <div className="actions">
                <button onClick={() => setEdit({ id: m.id, content: m.content })}>수정</button>
                <button onClick={() => confirm('이 메시지를 삭제할까요?') && run(api('/messages/' + m.id, 'DELETE'))}>삭제</button>
              </div>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {me ? (
        <form className="composer" onSubmit={send}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onEnter(send)} placeholder={`#${channel} 에 메시지 보내기 (Enter 전송, Shift+Enter 줄바꿈)`} maxLength={2000} />
          <button className="primary">전송</button>
        </form>
      ) : (
        <div className="composer locked">
          메시지를 쓰려면 <button className="link" onClick={onNeedLogin}>로그인</button>이 필요해요.
        </div>
      )}
    </>
  );
}

export default function App() {
  const [me, setMe] = useState(null);
  const [channels, setChannels] = useState([]);
  const [view, setView] = useState('일반'); // 채널 이름 또는 'members'
  const [modal, setModal] = useState(null); // 'login' | 'signup' | 'profile'

  const loadMe = () =>
    localStorage.getItem('token')
      ? api('/me').then(setMe).catch(logout)
      : setMe(null);

  function logout() {
    localStorage.removeItem('token');
    setMe(null);
    setModal(null);
  }

  useEffect(() => {
    api('/channels').then(setChannels).catch(() => {});
    loadMe();
  }, []);

  const isMembers = view === 'members';

  return (
    <div className="app">
      <nav className="sidebar">
        <h1>모여</h1>
        <h3>채널</h3>
        {channels.map((c) => (
          <button key={c} className={view === c ? 'active' : ''} onClick={() => setView(c)}># {c}</button>
        ))}
        <h3>둘러보기</h3>
        <button className={isMembers ? 'active' : ''} onClick={() => setView('members')}>👥 멤버 활동</button>

        <div className="account">
          {me ? (
            <>
              <button onClick={() => setModal('profile')} title="마이페이지">
                <Avatar id={me.id} name={me.nickname} /> {me.nickname}
              </button>
              <button onClick={logout}>로그아웃</button>
            </>
          ) : (
            <>
              <button onClick={() => setModal('login')}>로그인</button>
              <button onClick={() => setModal('signup')}>회원가입</button>
            </>
          )}
        </div>
      </nav>

      <main>
        <header className="topbar">{isMembers ? '👥 멤버 활동' : `# ${view}`}</header>
        {isMembers ? <Members /> : <Chat channel={view} me={me} onNeedLogin={() => setModal('login')} />}
      </main>

      {(modal === 'login' || modal === 'signup') && (
        <AuthModal mode={modal} setMode={setModal} onClose={() => setModal(null)} onDone={() => { setModal(null); loadMe(); }} />
      )}
      {modal === 'profile' && me && (
        <ProfileModal me={me} onSaved={setMe} onDeleted={logout} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
