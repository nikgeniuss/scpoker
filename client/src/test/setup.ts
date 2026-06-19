// Глобальный setup для vitest: jest-dom матчеры + авто-cleanup React-дерева между тестами.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
