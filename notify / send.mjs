// doday 알림 보내기 — GitHub Actions가 매일 저녁 실행해요
// 사용법: node send.mjs sched | left | test
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const MODE = process.argv[2] || 'sched';
const COLLECTION = 'doday', LEFT_MIN = 3;
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore(), fcm = getMessaging();

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // TZ=Asia/Seoul 로 실행
const pick = a => a[Math.floor(Math.random() * a.length)];
const TYPE = { perf: '수행평가', acad: '특별 일정', exam: '시험', etc: '일정' };
const jo = (w, a, b) => { const c = w.charCodeAt(w.length - 1) - 0xAC00; return w + (c >= 0 && c <= 11171 && c % 28 ? a : b); };

function schedMsg(s, t, tm) {
  const evs = (s.ev || []).filter(e => e.d === tm);
  const ex = s.exam || { days: [] }, exTm = (ex.days || []).includes(tm), exT = (ex.days || []).includes(t);
  if (!evs.length && !exTm) return null;
  let title;
  if (exTm && !evs.length) title = exT ? `내일도 ${ex.t} 있어요!` : `내일부터 ${jo(ex.t, '이에요', '예요')}!`;
  else {
    const tys = [...new Set(evs.map(e => e.ty))], n = evs.length + (exTm ? 1 : 0);
    const w = tys.length === 1 && !exTm ? (TYPE[tys[0]] || '일정') : '일정';
    title = n > 1 ? `내일 ${jo(w, '이', '가')} ${n}개 있어요!` : `내일 ${jo(w, '이', '가')} 있어요!`;
  }
  const names = evs.map(e => e.t); if (exTm) names.unshift(ex.t);
  const tail = pick(['오늘 미리 챙겨 두면 마음이 편해요', '준비물이랑 할 거 지금 한 번 확인해요', '자기 전에 한 번만 더 점검해요']);
  return { kind: 'sched', title, body: names.join(' · ') + '\n' + tail, tag: 'doday-sched', url: './' };
}
function leftMsg(s, t) {
  let n = 0; for (const d in (s.left || {})) if (d < t) n += s.left[d];
  if (n < LEFT_MIN) return null;
  const nm = s.name ? s.name + '님, ' : '';
  const v = pick([
    [`미룬 할 일이 ${n}개나 쌓였어요!`, `${nm}지금 딱 하나만 시작해 봐요. 시작이 제일 어려워요`],
    [`밀린 할 일 ${n}개, 오늘 좀 줄여 볼까요?`, `${nm}제일 짧은 것부터 하나 골라서 시작해요`],
    [`아직 ${n}개가 기다리고 있어요`, `${nm}지금 시작하면 자기 전에 꽤 줄일 수 있어요!`]
  ]);
  return { kind: 'left', title: v[0], body: v[1], tag: 'doday-left', url: './?go=left' };
}

const now = new Date(), t = ymd(now);
const tmD = new Date(now); tmD.setDate(tmD.getDate() + 1); const tm = ymd(tmD);

const snap = await db.collection(COLLECTION).get();
let sent = 0;
for (const doc of snap.docs) {
  const r = doc.data(), tokens = r.pushTokens || [], s = r.pushSnap;
  if (!tokens.length || !s) continue;
  const m = MODE === 'test' ? { kind: 'test', title: '알림 연결 완료!', body: '이제 저녁 6시·8시에 doday 알림이 와요', tag: 'doday-test', url: './' }
          : MODE === 'left' ? leftMsg(s, t) : schedMsg(s, t, tm);
  if (!m) continue;
  const res = await fcm.sendEachForMulticast({ tokens, data: m, webpush: { headers: { Urgency: 'high', TTL: '10800' } } });
  sent += res.successCount;
  const dead = tokens.filter((_, i) => { const c = res.responses[i].error?.code || ''; return c.includes('not-registered') || c.includes('invalid-registration-token') || c.includes('invalid-argument'); });
  if (dead.length) await doc.ref.update({ pushTokens: FieldValue.arrayRemove(...dead) });
}
console.log(`${MODE}: ${sent}개 보냄 (${t})`);
