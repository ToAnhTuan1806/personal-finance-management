import assert from 'node:assert/strict'
import test from 'node:test'
import { formatMoney } from '../src/components/recurring/recurringTemplateUtils.js'

test('D16 recurring cards and preview money preserve cents and sign', () => {
  for (const [input, expected] of [[15.5, '15,5 ₫'], ['0.01', '0,01 ₫'], [-1.25, '-1,25 ₫'], [1000, '1.000 ₫']]) {
    assert.equal(formatMoney(input), expected)
  }
})
