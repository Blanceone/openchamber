import { describe, expect, test } from 'bun:test';
import { resolveRecoveryNextStep } from './desktopRecoveryRouting';
import type { RecoveryNextStep } from './desktopRecoveryRouting';
import type { RecoveryVariant } from './desktopRecoveryConfig';

const EXPECTED_ROUTING: Record<RecoveryVariant, RecoveryNextStep['kind']> = {
  'local-unavailable': 'local-setup',
  'remote-unreachable': 'switch-default-to-local',
  'remote-incompatible': 'switch-default-to-local',
  'remote-wrong-service': 'switch-default-to-local',
  'remote-missing': 'switch-default-to-local',
  'missing-default-host': 'switch-default-to-local',
};

describe('resolveRecoveryNextStep', () => {
  for (const [variant, expectedKind] of Object.entries(EXPECTED_ROUTING) as [RecoveryVariant, RecoveryNextStep['kind']][]) {
    test(`${variant} + use-local -> ${expectedKind}`, () => {
      const result = resolveRecoveryNextStep(variant, 'use-local');
      expect(result).toEqual({ kind: expectedKind });
    });
  }
});
