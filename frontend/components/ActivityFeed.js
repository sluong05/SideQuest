import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getFriendFeed } from '../lib/api';
import { Icon } from './Icons';
import { timeAgo } from '../lib/questMeta';

export default function ActivityFeed() {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getFriendFeed()
      .then((r) => setFeed(r.data.feed))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(13,31,56,0.7)', border: '1px solid rgba(59,130,246,0.12)' }}>
      <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Friend Activity</h2>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : feed.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-navy-300 text-sm">No activity yet.</p>
          <p className="text-slate-400 text-xs mt-1">
            When friends complete tasks or log pushups, it'll show here.
          </p>
          <Link href="/friends" className="inline-block mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors">
            Find friends →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {feed.map((event, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-navy-700 border border-navy-600 flex items-center justify-center flex-shrink-0 text-sm">
                {event.type === 'task_completed' ? <Icon name="checkCircle" className="w-4 h-4" color="#4ade80" /> : <img src="/Bicep.svg" className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-navy-100">
                  <Link href={`/u/${event.username}`} className="font-semibold hover:text-blue-400 transition-colors">
                    {event.username}
                  </Link>
                  {event.type === 'task_completed'
                    ? <> completed <span className="text-navy-200">"{event.data.taskTitle}"</span></>
                    : <> logged <span className="text-blue-400 font-semibold">{event.data.pushupsCompleted} pushups</span></>
                  }
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{timeAgo(event.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
