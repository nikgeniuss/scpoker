import { describe, it, expect } from 'vitest';
import { validateSettingsPatch } from '../settingsValidation.js';

// validateSettingsPatch — чистая функция (PUT /admin/settings, нет существующего файла тестов
// до этого момента). Покрываем только новый блок responsibleGambling (ROADMAP §11.2) + одну
// базовую проверку, что существующая валидация не сломана попутно.

describe('validateSettingsPatch — базовая регрессия', () => {
  it('валидный turnDurationMs проходит без изменений', () => {
    const r = validateSettingsPatch({ turnDurationMs: 30000 });
    expect(r).toEqual({ patch: { turnDurationMs: 30000 } });
  });
});

describe('validateSettingsPatch — responsibleGambling', () => {
  it('принимает частичный набор булевых тоглов', () => {
    const r = validateSettingsPatch({ responsibleGambling: { lossLimitEnabled: false } });
    expect(r).toEqual({ patch: { responsibleGambling: { lossLimitEnabled: false } } });
  });

  it('принимает все 5 тоглов сразу', () => {
    const body = {
      responsibleGambling: {
        depositLimitEnabled: false,
        lossLimitEnabled: false,
        sessionTimeLimitEnabled: false,
        selfExclusionEnabled: false,
        timeoutEnabled: false,
      },
    };
    expect(validateSettingsPatch(body)).toEqual({ patch: body });
  });

  it('не-объект → ошибка', () => {
    const r = validateSettingsPatch({ responsibleGambling: 'nope' });
    expect('error' in r).toBe(true);
  });

  it('не-булево значение тоггла → ошибка с указанием поля', () => {
    const r = validateSettingsPatch({ responsibleGambling: { timeoutEnabled: 'yes' } });
    expect(r).toEqual({ error: 'responsibleGambling.timeoutEnabled: boolean' });
  });

  it('неизвестные поля внутри блока тихо игнорируются (не попадают в patch)', () => {
    const r = validateSettingsPatch({ responsibleGambling: { depositLimitEnabled: true, bogusField: 123 } });
    expect(r).toEqual({ patch: { responsibleGambling: { depositLimitEnabled: true } } });
  });

  it('отсутствие поля responsibleGambling в body — patch пустой, без ошибки', () => {
    const r = validateSettingsPatch({});
    expect(r).toEqual({ patch: {} });
  });
});
