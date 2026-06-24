// Глобальный setup для vitest: jest-dom матчеры + авто-cleanup React-дерева между тестами.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '../i18n'; // инициализирует i18next (компоненты на useTranslation иначе падают с NO_I18NEXT_INSTANCE)

afterEach(() => {
  cleanup();
});
