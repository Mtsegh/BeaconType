import { describe, expect, it } from 'vitest'
import { codeForChar, fingerFor } from './fingers'

describe('fingerFor', () => {
  it('maps home-row keys to the standard fingers', () => {
    expect(fingerFor('a')).toBe('leftPinky')
    expect(fingerFor('s')).toBe('leftRing')
    expect(fingerFor('d')).toBe('leftMiddle')
    expect(fingerFor('f')).toBe('leftIndex')
    expect(fingerFor('j')).toBe('rightIndex')
    expect(fingerFor('k')).toBe('rightMiddle')
    expect(fingerFor('l')).toBe('rightRing')
    expect(fingerFor(';')).toBe('rightPinky')
  })

  it('treats uppercase letters like their lowercase key', () => {
    expect(fingerFor('A')).toBe('leftPinky')
    expect(fingerFor('R')).toBe('leftIndex')
    expect(fingerFor('M')).toBe('rightIndex')
  })

  it('splits the number row correctly', () => {
    expect(fingerFor('1')).toBe('leftPinky')
    expect(fingerFor('5')).toBe('leftIndex')
    expect(fingerFor('6')).toBe('rightIndex')
    expect(fingerFor('0')).toBe('rightPinky')
  })

  it('uses both index fingers for the stretched columns', () => {
    expect(fingerFor('r')).toBe('leftIndex')
    expect(fingerFor('t')).toBe('leftIndex')
    expect(fingerFor('g')).toBe('leftIndex')
    expect(fingerFor('b')).toBe('leftIndex')
    expect(fingerFor('y')).toBe('rightIndex')
    expect(fingerFor('u')).toBe('rightIndex')
    expect(fingerFor('h')).toBe('rightIndex')
    expect(fingerFor('n')).toBe('rightIndex')
  })

  it('uses the thumb for space', () => {
    expect(fingerFor(' ')).toBe('thumb')
  })

  it('maps shifted punctuation to the base key finger', () => {
    expect(fingerFor('!')).toBe('leftPinky')
    expect(fingerFor(':')).toBe('rightPinky')
    expect(fingerFor('?')).toBe('rightPinky')
    expect(fingerFor('<')).toBe('rightMiddle')
  })

  it('returns null for characters with no fixed QWERTY key', () => {
    expect(fingerFor('€')).toBeNull()
    expect(fingerFor('')).toBeNull()
  })
})

describe('codeForChar', () => {
  it('maps letters to Key codes, case-insensitively', () => {
    expect(codeForChar('a')).toBe('KeyA')
    expect(codeForChar('Q')).toBe('KeyQ')
    expect(codeForChar('z')).toBe('KeyZ')
  })

  it('maps digits to Digit codes', () => {
    expect(codeForChar('0')).toBe('Digit0')
    expect(codeForChar('7')).toBe('Digit7')
  })

  it('maps punctuation and shifted symbols to their physical codes', () => {
    expect(codeForChar(' ')).toBe('Space')
    expect(codeForChar(';')).toBe('Semicolon')
    expect(codeForChar("'")).toBe('Quote')
    expect(codeForChar(',')).toBe('Comma')
    expect(codeForChar('.')).toBe('Period')
    expect(codeForChar('/')).toBe('Slash')
    expect(codeForChar('!')).toBe('Digit1')
    expect(codeForChar(':')).toBe('Semicolon')
    expect(codeForChar('?')).toBe('Slash')
    expect(codeForChar('~')).toBe('Backquote')
  })

  it('returns null for characters without a fixed key', () => {
    expect(codeForChar('€')).toBeNull()
    expect(codeForChar('')).toBeNull()
  })
})
