import { useState } from 'react'
import LogDialog from '../../components/LogDialog.jsx'
import { describe, hourLabel } from '../../store/parameterLog.js'

export default function ReasonDialog({ deviation, row, onSave, onClose }) {
  const [reason, setReason] = useState(deviation.reason ?? '')
  const [lot, setLot] = useState(deviation.lot ?? '')

  return (
    <LogDialog
      title={`Deviation · ${hourLabel(deviation.hour)} · ${row.label}`}
      submitLabel="Send for approval"
      onSubmit={() => {
        onSave({ reason: reason.trim(), lot: lot.trim() })
        return true
      }}
      onClose={onClose}
    >
      <p className={`log-dialog__dev mono is-${row.zeroTol ? 'changed' : 'limit'}`}>
        {deviation.value.toFixed(row.digits)} {row.unit} · {describe(row, deviation.value)}
      </p>
      {deviation.adminNote && <p className="log-dialog__note">{deviation.adminBy ?? 'Approver'} asked: {deviation.adminNote}</p>}

      <label className="log-dialog__field">
        <span className="mono">Reason</span>
        <textarea
          required
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What changed and why, e.g. Sink mark on part – cooling time +1 s."
        />
      </label>
      <label className="log-dialog__field">
        <span className="mono">Lot no.</span>
        <input required value={lot} onChange={(e) => setLot(e.target.value)} placeholder="LOT 0630-A2" />
      </label>
    </LogDialog>
  )
}
