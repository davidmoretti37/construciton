'use client';

import { motion } from 'framer-motion';
import { ClipboardDocumentListIcon, UserGroupIcon, BellAlertIcon } from '@heroicons/react/24/outline';
import PhoneMockup from './PhoneMockup';

const projects = [
  { name: 'Kitchen', client: 'Johnson', progress: 75, color: 'bg-blue-500' },
  { name: 'Bathroom', client: 'Smith', progress: 45, color: 'bg-emerald-500' },
  { name: 'Deck', client: 'Davis', progress: 20, color: 'bg-orange-500' },
  { name: 'Garage', client: 'Wilson', progress: 90, color: 'bg-violet-500' },
];

const schedule = [
  { time: '8:00 AM', team: 'Team A', project: 'Kitchen' },
  { time: '11:00 AM', team: 'Inspection', project: 'Deck' },
  { time: '1:00 PM', team: 'Team B', project: 'Bathroom' },
];

const workers = [
  { initial: 'M', color: 'from-orange-400 to-orange-600' },
  { initial: 'J', color: 'from-blue-400 to-blue-600' },
  { initial: 'D', color: 'from-emerald-400 to-emerald-600' },
];

const bullets = [
  { icon: ClipboardDocumentListIcon, title: 'See all projects at a glance', desc: 'Progress, phases, and status' },
  { icon: UserGroupIcon, title: 'Assign crews in seconds', desc: 'Workers and supervisors per phase' },
  { icon: BellAlertIcon, title: 'Automatic reminders', desc: 'Never miss a deadline' },
];

function ProgressBar({ progress, color, isActive, delay }: { progress: number; color: string; isActive: boolean; delay: number }) {
  return (
    <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: '0%' }}
        animate={
          isActive
            ? {
                width: [`0%`, `${Math.min(progress + 30, 100)}%`, `${Math.max(progress - 10, 0)}%`, `${progress}%`],
              }
            : { width: '0%' }
        }
        transition={{ duration: 1.2, delay, ease: 'easeOut', times: [0, 0.4, 0.7, 1] }}
        className={`h-full rounded-full ${color}`}
      />
    </div>
  );
}

export default function SceneProjects({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex flex-col lg:flex-row-reverse items-center gap-6 lg:gap-16 w-full max-w-6xl mx-auto px-6">
      {/* Right: Text */}
      <div className="flex-1 text-center lg:text-left">
        <motion.p
          initial={{ opacity: 0 }}
          animate={isActive ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="text-cyan-600 text-sm font-semibold tracking-wider uppercase mb-3"
        >
          Project Management
        </motion.p>
        <motion.h3
          initial={{ opacity: 0, y: 20 }}
          animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 15, stiffness: 100 }}
          className="text-2xl sm:text-3xl lg:text-5xl font-extrabold text-gray-900 mb-5 leading-tight"
        >
          Everything. One Place.{' '}
          <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            Zero Stress.
          </span>
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="text-text-secondary text-base leading-relaxed mb-8 max-w-md mx-auto lg:mx-0"
        >
          Every job is a project with phases, tasks, assigned workers, and a timeline. See progress at a glance.
        </motion.p>

        <div className="space-y-4">
          {bullets.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, x: -20 }}
              animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
              transition={{ duration: 0.4, delay: 2.0 + i * 0.15 }}
              className="flex items-start gap-3 text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0 mt-0.5">
                <b.icon className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <p className="text-gray-900 text-sm font-medium">{b.title}</p>
                <p className="text-text-muted text-xs">{b.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Left: Phone mockup */}
      <div className="flex-1 flex justify-center">
        <PhoneMockup isActive={isActive}>
          {/* Header */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isActive ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="flex items-center justify-between mb-3"
          >
            <span className="text-[9px] font-bold text-text-muted tracking-wider">PROJECTS</span>
            <div className="flex gap-0.5">
              <div className="w-1 h-1 rounded-full bg-gray-300" />
              <div className="w-1 h-1 rounded-full bg-gray-300" />
              <div className="w-1 h-1 rounded-full bg-gray-300" />
              <div className="w-1 h-1 rounded-full bg-gray-300" />
            </div>
          </motion.div>

          {/* Project cards grid */}
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {projects.map((p, i) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={isActive ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', damping: 12, delay: 0.5 + i * 0.2 }}
                className="bg-gray-50 rounded-lg p-2 border border-gray-100"
              >
                <p className="text-gray-900 text-[10px] font-semibold">{p.name}</p>
                <p className="text-text-muted text-[8px] mb-1.5">{p.client}</p>
                <ProgressBar progress={p.progress} color={p.color} isActive={isActive} delay={0.5 + i * 0.2 + 0.3} />
                <p className="text-text-muted text-[8px] mt-1 text-right">{p.progress}%</p>
              </motion.div>
            ))}
          </div>

          {/* Schedule section */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 15 }}
            transition={{ duration: 0.5, delay: 1.2 }}
            className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-2 mb-2"
          >
            <p className="text-[8px] font-bold text-violet-400 tracking-wider mb-1.5">TODAY&apos;S SCHEDULE</p>
            {schedule.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-[8px] py-0.5">
                <span className="text-text-muted w-10 shrink-0">{s.time}</span>
                <span className="text-violet-600 font-medium">{s.team}</span>
                <span className="text-gray-300">→</span>
                <span className="text-text-secondary">{s.project}</span>
              </div>
            ))}
          </motion.div>

          {/* Workers */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isActive ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.4, delay: 1.5 }}
            className="flex items-center gap-2"
          >
            <span className="text-[8px] text-text-muted">On Site</span>
            <div className="flex -space-x-1.5">
              {workers.map((w, i) => (
                <motion.div
                  key={w.initial}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={isActive ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
                  transition={{ type: 'spring', damping: 10, delay: 1.5 + i * 0.1 }}
                  className={`w-5 h-5 rounded-full bg-gradient-to-b ${w.color} flex items-center justify-center text-white text-[7px] font-bold border-2 border-white`}
                >
                  {w.initial}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </PhoneMockup>
      </div>
    </div>
  );
}
