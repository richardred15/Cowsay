const Pagination = require('../../../modules/pagination');

describe('Pagination Utilities', () => {
  describe('Page Calculations', () => {
    test('should calculate correct number of pages', () => {
      const testCases = [
        { items: 5, perPage: 10, expected: 1 },
        { items: 10, perPage: 10, expected: 1 },
        { items: 11, perPage: 10, expected: 2 },
        { items: 25, perPage: 10, expected: 3 },
        { items: 0, perPage: 10, expected: 1 }
      ];

      testCases.forEach(({ items, perPage, expected }) => {
        const pages = Math.max(1, Math.ceil(items / perPage));
        expect(pages).toBe(expected);
      });
    });

    test('should calculate correct start and end indices', () => {
      const currentPage = 2;
      const itemsPerPage = 10;
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;

      expect(startIndex).toBe(10);
      expect(endIndex).toBe(20);
    });
  });

  describe('Page Validation', () => {
    test('should clamp page numbers to valid range', () => {
      const totalPages = 5;
      
      const testCases = [
        { input: 0, expected: 1 },
        { input: 1, expected: 1 },
        { input: 3, expected: 3 },
        { input: 5, expected: 5 },
        { input: 10, expected: 5 }
      ];

      testCases.forEach(({ input, expected }) => {
        const validPage = Math.max(1, Math.min(input, totalPages));
        expect(validPage).toBe(expected);
      });
    });
  });
});