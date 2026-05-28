import { motion } from 'framer-motion'

export default function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <motion.div className="stat-card" whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
      <div className="stat-icon">{Icon && <Icon size={20} />}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {hint && <small>{hint}</small>}
      </div>
    </motion.div>
  )
}
