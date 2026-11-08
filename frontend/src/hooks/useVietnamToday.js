import { useEffect, useState } from 'react'
import { localToday } from '../utils/transactionForm'
import { watchVietnamDay } from '../utils/vietnamDayClock'

export default function useVietnamToday() {
  const [today, setToday] = useState(localToday)
  useEffect(() => watchVietnamDay(setToday), [])
  return today
}
