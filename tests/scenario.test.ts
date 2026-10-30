import { describe, expect, it } from 'vitest'
import strings from '../messages/strings.json'
import { t } from '../src/i18n/t'

/**
 * 情境完整性测试：demo 会用到的每一个 key 都存在且非空。
 * （多语言已按需求移除，只剩 zh-CN 一份 strings.json）
 */

const REQUIRED_KEYS = [
  // nav
  'nav.friend', 'nav.lobby', 'nav.history', 'nav.profile', 'nav.settings',
  // login
  'login.title', 'login.subtitle', 'login.tabLogin', 'login.tabRegister',
  'login.email', 'login.password', 'login.nickname', 'login.submitLogin',
  'login.submitRegister', 'login.loading', 'login.errorMissingFields',
  'login.errorWeakPassword', 'login.footer',
  // friend
  'friend.title', 'friend.subtitle', 'friend.empty', 'friend.inputPlaceholder',
  'friend.send', 'friend.typing', 'friend.nextMeet', 'friend.nextMeetHint',
  'friend.taskCard', 'friend.hasNews', 'friend.memoriesTitle', 'friend.memoriesHint',
  'friend.demoTag', 'friend.openReport',
  // task
  'task.title', 'task.subtitle', 'task.goal', 'task.condition', 'task.count',
  'task.doneWhen', 'task.confirm', 'task.cancel', 'task.statusRunning',
  'task.statusDone', 'task.statusPaused', 'task.progress', 'task.progressOf',
  // logs
  'logs.title', 'logs.hint', 'logs.reason', 'logs.empty',
  // proxyChat
  'proxyChat.withWho', 'proxyChat.viaTwin', 'proxyChat.viaOtherTwin',
  'proxyChat.privacyRewrite', 'proxyChat.privacyRewriteTip', 'proxyChat.round',
  'proxyChat.verdictPanel', 'proxyChat.verdictWatching', 'proxyChat.trendUp',
  'proxyChat.trendFlat', 'proxyChat.trendDown', 'proxyChat.liveTag',
  'proxyChat.takeOver', 'proxyChat.resultLink',
  // result
  'result.mutualBadge', 'result.mutualBadgeSub', 'result.verdictTitle', 'result.myVerdict',
  'result.oppVerdictHidden', 'result.whyFit', 'result.whyFitHint', 'result.outline',
  'result.outlineTopics', 'result.outlineFit', 'result.outlineFriction',
  'result.outlineHighlight', 'result.fullLog', 'result.fullLogShow', 'result.fullLogHide',
  'result.roundTag', 'result.jumpToRound', 'result.nextTitle', 'result.takeOver',
  'result.continueTwin', 'result.skip', 'result.score', 'result.scoreNote',
  // handoff
  'handoff.title', 'handoff.subtitle', 'handoff.verdictNow', 'handoff.keyPoints',
  'handoff.twinSaid', 'handoff.suggest', 'handoff.startChat', 'handoff.back',
  // report
  'report.title', 'report.statsTitle', 'report.statScanned', 'report.statChatted',
  'report.statFit', 'report.statUnit', 'report.statSession', 'report.calcNote',
  'report.calcNoteAdjust', 'report.seeResult', 'report.dismiss', 'report.friendTone',
  // history
  'history.title', 'history.subtitle', 'history.empty', 'history.resultMutual',
  'history.resultOneWay', 'history.resultNo', 'history.resultRunning', 'history.restart',
  'history.restartSelf', 'history.restartTwin', 'history.restartHint',
  'history.reasonTitle', 'history.reasonMatch', 'history.reasonCondition',
  'history.reasonFriction', 'history.initiatedAuto', 'history.initiatedManual',
  'history.viewChat', 'history.selfInsight', 'history.selfInsightText',
  // lobby
  'lobby.title', 'lobby.subtitle', 'lobby.empty', 'lobby.candidatesTitle',
  'lobby.online', 'lobby.proxying', 'lobby.fitPredict', 'lobby.mbtiBadge',
  'lobby.mbtiNote', 'lobby.twinHelper', 'lobby.helperPlaceholder',
  'lobby.helperSend', 'lobby.helperTyping', 'lobby.helperIntro',
  // profile
  'profile.title', 'profile.shareable', 'profile.shareableNote', 'profile.memories',
  'profile.memoriesEmpty', 'profile.comingSoon', 'profile.draftReady', 'profile.edit',
  'profile.saveConfirm', 'profile.cancelEdit', 'profile.memorySource',
  'profile.confidence', 'profile.confLow', 'profile.confMid', 'profile.confHigh',
  'profile.deleteMemory', 'profile.confirmShareNote', 'profile.confirmed',
  'profile.styleTitle', 'profile.styleNote',
  // settings
  'settings.title', 'settings.devMode', 'settings.devModeHint', 'settings.proactive',
  'settings.proactiveOff', 'settings.proactiveLow', 'settings.proactiveNormal',
  'settings.socialAgent', 'settings.socialAgentNote', 'settings.comingSoon',
  'settings.gear', 'settings.gearOneWay', 'settings.gearMutual',
  'settings.gearOneWayHint', 'settings.gearMutualHint', 'settings.avgManualTime',
  'settings.avgManualTimeNote', 'settings.logout',
  // common
  'common.loading', 'common.aiBadge', 'common.aiChatting', 'common.cancel',
  'common.confirm', 'common.save', 'common.comingSoonBadge', 'common.logout',
  'common.close', 'common.back', 'common.demoBadge', 'common.fictionalNote',
  // notFound
  'notFound.title', 'notFound.description', 'notFound.back',
]

describe('scenario string integrity', () => {
  it('every key used by the 12 screens exists and is non-empty', () => {
    const missing: string[] = []
    for (const key of REQUIRED_KEYS) {
      const value = t(key)
      if (value === key || value.trim() === '') missing.push(key)
    }
    expect(missing, `missing keys: ${missing.join(', ')}`).toEqual([])
  })

  it('t() interpolates {{var}}', () => {
    expect(t('proxyChat.round', { n: 4 })).toBe('第 4 轮')
    expect(t('task.progressOf', { done: 1, total: 3 })).toBe('1 / 3 位双向合适')
  })

  it('t() returns the key itself for unknown keys (easy to spot)', () => {
    expect(t('no.such.key')).toBe('no.such.key')
  })
})

describe('strings.json shape', () => {
  it('top-level sections exist', () => {
    const sections = Object.keys(strings as Record<string, unknown>)
    for (const section of ['nav', 'login', 'friend', 'task', 'logs', 'proxyChat', 'result', 'handoff', 'report', 'history', 'lobby', 'profile', 'settings', 'common', 'notFound']) {
      expect(sections).toContain(section)
    }
  })
})
