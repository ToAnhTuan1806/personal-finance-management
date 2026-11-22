import test from 'node:test'
import assert from 'node:assert/strict'
import { editSavingsAmount, getSavingsMascot, recordChallengeSaving } from '../src/utils/savingsChallenges.js'

test('typing and clearing money preserves grouping and caret', () => {
  assert.deepEqual(editSavingsAmount('50.000', '50.0000', 7, 'insertText'), { value: '500.000', caret: 7 })
  assert.deepEqual(editSavingsAmount('500.000', '', 0, 'deleteContentBackward'), { value: '', caret: 0 })
  assert.deepEqual(editSavingsAmount('', '5000000', 7, 'insertFromPaste'), { value: '5.000.000', caret: 9 })
})
test('backspace/delete through a dot removes a digit instead of trapping the cursor', () => {
  assert.deepEqual(editSavingsAmount('12.345', '12345', 2, 'deleteContentBackward'), { value: '1.345', caret: 1 })
  assert.deepEqual(editSavingsAmount('12.345', '12345', 2, 'deleteContentForward'), { value: '1.245', caret: 3 })
  assert.deepEqual(editSavingsAmount('1.000', '1000', 1, 'deleteContentBackward'), { value: '000', caret: 0 })
})
test('editing middle, replacing selection and invalid decimal values', () => {
  assert.deepEqual(editSavingsAmount('123.456', '1293.456', 3, 'insertText'), { value: '1.293.456', caret: 4 })
  assert.equal(editSavingsAmount('500.000', '7', 1, 'insertText').value, '7')
  assert.equal(editSavingsAmount('', '1.50', 4, 'insertFromPaste').value, '1.50')
  assert.equal(editSavingsAmount('500.000', '1.50', 4, 'insertFromPaste').value, '1.50')
})
test('only the remaining target may be recorded', () => {
 const c={id:'a', target:500000, startDate:'2026-11-01',endDate:'2026-11-30',savings:[{id:'old',amount:300000,date:'2026-11-01'}]}
 assert.throws(()=>recordChallengeSaving(c,{amount:'200.001',date:'2026-11-20'},'2026-11-20'),/còn thiếu/)
 assert.equal(recordChallengeSaving(c,{amount:'200.000',date:'2026-11-20'},'2026-11-20').savings.length,2)
})
test('completed challenge count selects distinct mascots and cycles safely', () => {
 const animals=Array.from({length:5},(_,i)=>getSavingsMascot({completedChallenges:i+1}).name)
 assert.equal(new Set(animals).size,5)
 assert.equal(getSavingsMascot({completedChallenges:6}).name,animals[0])
 assert.equal(getSavingsMascot({}).name,animals[0])
})
