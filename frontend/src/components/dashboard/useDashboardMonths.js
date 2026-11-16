import { useEffect, useMemo, useState } from 'react'
import { loadDashboardMonths } from './monthlyInsights.js'

export default function useDashboardMonths(month, reloadKey, mutationVersion) {
  const [results, setResults] = useState({})
  const requestKey = useMemo(() => ({ month, reloadKey, mutationVersion }), [month, reloadKey, mutationVersion])
  useEffect(() => {
    const request = loadDashboardMonths(month, (key, result) => {
      setResults((previous) => ({ ...previous, [key]: { ...result, requestKey } }))
    })
    return request.cancel
  }, [month, requestKey])

  const forCurrentRequest = (result) =>
    result?.requestKey === requestKey
      ? result
      : { status: 'loading' }
  return {
    summary: results.current?.month === month && results.current.status === 'success' ? results.current.data : null,
    current: forCurrentRequest(results.current),
    previous: forCurrentRequest(results.previous),
  }
}
