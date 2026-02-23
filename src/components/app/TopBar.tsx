import * as React from 'react';
import { GlassDropdown } from '../GlassDropdown';

type TopBarProps = {
  selectedBuild: string;
  buildOptions: string[];
  buildLabel: (id: string) => string;
  onBuildChange: (next: string) => void;

  selectedCategory: string;
  categoryOptions: string[];
  selectedCategoryColor: string | null;
  onCategoryChange: (next: string) => void;

  matchedRooms: number;
  totalRooms: number;

  searchText: string;
  onSearchTextChange: (text: string) => void;
  onClearSearch: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;

  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

export function TopBar({
  selectedBuild,
  buildOptions,
  buildLabel,
  onBuildChange,
  selectedCategory,
  categoryOptions,
  selectedCategoryColor,
  onCategoryChange,
  matchedRooms,
  totalRooms,
  searchText,
  onSearchTextChange,
  onClearSearch,
  searchInputRef,
  theme,
  onToggleTheme,
}: TopBarProps) {
  return (
    <div className="topBar">
      <GlassDropdown
        value={selectedBuild}
        onChange={onBuildChange}
        buttonClassName="topSelect"
        options={buildOptions.map((b) => ({ value: b, label: buildLabel(b) }))}
      />

      <div
        className="topSelectAccentWrap"
        data-active={selectedCategory !== '__all__' && selectedCategoryColor ? 'true' : 'false'}
        style={
          selectedCategory !== '__all__' && selectedCategoryColor
            ? ({ ['--accent-color']: selectedCategoryColor } as React.CSSProperties)
            : undefined
        }
      >
        <GlassDropdown
          value={selectedCategory}
          onChange={onCategoryChange}
          buttonClassName="topSelect topSelectCategory"
          options={[
            { value: '__all__', label: 'Все категории' },
            ...categoryOptions.map((c) => ({ value: c, label: c })),
          ]}
        />
      </div>

      <div className="topCountBadge" aria-label="Найдено помещений">
        {matchedRooms}/{totalRooms}
      </div>

      <div className="topSearchWrap">
        {searchText.length > 0 ? (
          <button className="topSearchClear" type="button" aria-label="Очистить поиск" onClick={onClearSearch}>
            ×
          </button>
        ) : null}
        <input
          ref={searchInputRef}
          className="topSearch"
          value={searchText}
          onChange={(e) => onSearchTextChange(e.target.value)}
          placeholder="Поиск по номеру или описанию"
        />
      </div>

      <button className="topButton topThemeButton" type="button" onClick={onToggleTheme}>
        {theme === 'light' ? 'Ночная тема 🌃' : 'Дневная тема 🌞'}
      </button>

      <button className="topButton" type="button">
        Сообщить об ошибке
      </button>
    </div>
  );
}
