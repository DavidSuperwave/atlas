'use client';

import { useState } from 'react';

interface FilterState {
  status: string;
  validity: string;
  domain: string;
  linkedin: string;
  search: string;
  validOnly: boolean;
  industry: string;
  industrySearch: string;
  keywords: string[];
  jobTitleCategories: string[];
  jobTitleKeywords: string[];
}

interface JobTitleCategory {
  id: string;
  label: string;
  keywords: string[];
}

interface JobTitleKeywordWithCount {
  keyword: string;
  count: number;
}

interface IndustryWithCount {
  industry: string;
  count: number;
}

interface LeadsFilterSidebarProps {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: string | boolean | string[]) => void;
  onClearAll: () => void;
  totalCount: number;
  filteredCount: number;
  industriesWithCounts: IndustryWithCount[];
  uniqueKeywords: string[];
  jobTitleCategories: JobTitleCategory[];
  jobTitleKeywordsWithCounts: JobTitleKeywordWithCount[];
}

export default function LeadsFilterSidebar({
  filters,
  onFilterChange,
  onClearAll,
  totalCount,
  filteredCount,
  industriesWithCounts,
  uniqueKeywords,
  jobTitleCategories,
  jobTitleKeywordsWithCounts
}: LeadsFilterSidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    quickViews: false,
    status: false,
    company: false,
    industry: false,
    keywords: false,
    jobTitle: false
  });

  const [showAllIndustries, setShowAllIndustries] = useState(false);
  const [showAllKeywords, setShowAllKeywords] = useState(false);
  const [showAllJobTitleKeywords, setShowAllJobTitleKeywords] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const activeFilterCount = [
    filters.status !== 'all',
    filters.domain !== 'all',
    filters.linkedin !== 'all',
    filters.search !== '',
    filters.validOnly,
    filters.industry !== 'all',
    filters.industrySearch !== '',
    filters.keywords.length > 0,
    filters.jobTitleCategories.length > 0,
    filters.jobTitleKeywords.length > 0
  ].filter(Boolean).length;

  // Toggle functions for multi-select filters
  const toggleKeyword = (keyword: string) => {
    const newKeywords = filters.keywords.includes(keyword)
      ? filters.keywords.filter(k => k !== keyword)
      : [...filters.keywords, keyword];
    onFilterChange('keywords', newKeywords);
  };

  const toggleJobTitleCategory = (categoryId: string) => {
    const newCategories = filters.jobTitleCategories.includes(categoryId)
      ? filters.jobTitleCategories.filter(c => c !== categoryId)
      : [...filters.jobTitleCategories, categoryId];
    onFilterChange('jobTitleCategories', newCategories);
  };

  const toggleJobTitleKeyword = (keyword: string) => {
    const newKeywords = filters.jobTitleKeywords.includes(keyword)
      ? filters.jobTitleKeywords.filter(k => k !== keyword)
      : [...filters.jobTitleKeywords, keyword];
    onFilterChange('jobTitleKeywords', newKeywords);
  };

  const FilterSection = ({ 
    title, 
    section, 
    children 
  }: { 
    title: string; 
    section: string; 
    children: React.ReactNode 
  }) => (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => toggleSection(section)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expandedSections[section] ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expandedSections[section] && (
        <div className="px-4 pb-4 space-y-2">
          {children}
        </div>
      )}
    </div>
  );

  const FilterOption = ({ 
    label, 
    value, 
    currentValue, 
    filterKey,
    count
  }: { 
    label: string; 
    value: string; 
    currentValue: string; 
    filterKey: keyof FilterState;
    count?: number;
  }) => (
    <button
      onClick={() => onFilterChange(filterKey, value)}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
        currentValue === value
          ? 'bg-blue-50 text-blue-700 font-medium'
          : 'text-gray-600 hover:bg-gray-50'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${
          currentValue === value ? 'bg-blue-500' : 'bg-gray-300'
        }`} />
        {label}
      </span>
      {count !== undefined && (
        <span className="text-xs text-gray-400">{count}</span>
      )}
    </button>
  );

  return (
    <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-200 bg-gray-50/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Filters</h2>
          {activeFilterCount > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {activeFilterCount} active
            </span>
          )}
        </div>
        
        {/* Search Input */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search leads..."
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          />
        </div>
      </div>

      {/* Filter Sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Quick Views */}
        <FilterSection title="Quick Views" section="quickViews">
          <button
            onClick={() => onFilterChange('validOnly', !filters.validOnly)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              filters.validOnly
                ? 'bg-green-50 text-green-700 font-medium border border-green-200'
                : 'text-gray-600 hover:bg-gray-50 border border-transparent'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Valid Emails Only
            {filters.validOnly && (
              <svg className="w-4 h-4 ml-auto" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            )}
          </button>
        </FilterSection>

        {/* Email Status */}
        <FilterSection title="Email Status" section="status">
          <FilterOption label="All Statuses" value="all" currentValue={filters.status} filterKey="status" />
          <FilterOption label="Valid" value="valid" currentValue={filters.status} filterKey="status" />
          <FilterOption label="Catchall" value="catchall" currentValue={filters.status} filterKey="status" />
          <FilterOption label="Invalid" value="invalid" currentValue={filters.status} filterKey="status" />
        </FilterSection>

        {/* Company Info */}
        <FilterSection title="Company Info" section="company">
          <div className="space-y-1 mb-3">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide px-1">Domain</p>
            <FilterOption label="All" value="all" currentValue={filters.domain} filterKey="domain" />
            <FilterOption label="Has Domain" value="yes" currentValue={filters.domain} filterKey="domain" />
            <FilterOption label="No Domain" value="no" currentValue={filters.domain} filterKey="domain" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide px-1">LinkedIn</p>
            <FilterOption label="All" value="all" currentValue={filters.linkedin} filterKey="linkedin" />
            <FilterOption label="Has LinkedIn" value="yes" currentValue={filters.linkedin} filterKey="linkedin" />
            <FilterOption label="No LinkedIn" value="no" currentValue={filters.linkedin} filterKey="linkedin" />
          </div>
        </FilterSection>

        {/* Industry Filter */}
        <FilterSection title="Industry" section="industry">
          {/* Industry Search */}
          <div className="relative mb-3">
            <input
              type="text"
              placeholder="Search industries..."
              value={filters.industrySearch}
              onChange={(e) => onFilterChange('industrySearch', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          
          {/* Industry Dropdown with Counts */}
          <div className="space-y-1">
            <FilterOption label="All Industries" value="all" currentValue={filters.industry} filterKey="industry" />
            {(showAllIndustries ? industriesWithCounts : industriesWithCounts.slice(0, 8)).map(({ industry, count }) => (
              <button
                key={industry}
                onClick={() => onFilterChange('industry', industry)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                  filters.industry === industry
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    filters.industry === industry ? 'bg-blue-500' : 'bg-gray-300'
                  }`} />
                  {industry}
                </span>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{count}</span>
              </button>
            ))}
            {industriesWithCounts.length > 8 && (
              <button
                onClick={() => setShowAllIndustries(!showAllIndustries)}
                className="w-full text-xs text-blue-600 hover:text-blue-800 py-2 text-center"
              >
                {showAllIndustries ? 'Show less' : `Show all (${industriesWithCounts.length})`}
              </button>
            )}
          </div>
        </FilterSection>

        {/* Keywords Filter */}
        {uniqueKeywords.length > 0 && (
          <FilterSection title="Keywords" section="keywords">
            <div className="space-y-1">
              {filters.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {filters.keywords.map(kw => (
                    <span 
                      key={kw}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full"
                    >
                      {kw}
                      <button 
                        onClick={() => toggleKeyword(kw)}
                        className="hover:text-blue-900"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {(showAllKeywords ? uniqueKeywords : uniqueKeywords.slice(0, 10)).map(keyword => (
                <button
                  key={keyword}
                  onClick={() => toggleKeyword(keyword)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                    filters.keywords.includes(keyword)
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                      filters.keywords.includes(keyword) 
                        ? 'bg-blue-500 border-blue-500' 
                        : 'border-gray-300'
                    }`}>
                      {filters.keywords.includes(keyword) && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    {keyword}
                  </span>
                </button>
              ))}
              {uniqueKeywords.length > 10 && (
                <button
                  onClick={() => setShowAllKeywords(!showAllKeywords)}
                  className="w-full text-xs text-blue-600 hover:text-blue-800 py-2 text-center"
                >
                  {showAllKeywords ? 'Show less' : `Show all (${uniqueKeywords.length})`}
                </button>
              )}
            </div>
          </FilterSection>
        )}

        {/* Job Title Filter */}
        <FilterSection title="Job Title" section="jobTitle">
          {/* Predefined Categories */}
          <div className="mb-3">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide px-1 mb-2">Categories</p>
            <div className="flex flex-wrap gap-2">
              {jobTitleCategories.map(category => (
                <button
                  key={category.id}
                  onClick={() => toggleJobTitleCategory(category.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    filters.jobTitleCategories.includes(category.id)
                      ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                      : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>

          {/* Common Keywords with Counts */}
          {jobTitleKeywordsWithCounts.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide px-1 mb-2">Common Keywords</p>
              {filters.jobTitleKeywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {filters.jobTitleKeywords.map(kw => (
                    <span 
                      key={kw}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full"
                    >
                      {kw}
                      <button 
                        onClick={() => toggleJobTitleKeyword(kw)}
                        className="hover:text-indigo-900"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                {(showAllJobTitleKeywords ? jobTitleKeywordsWithCounts : jobTitleKeywordsWithCounts.slice(0, 10)).map(({ keyword, count }) => (
                  <button
                    key={keyword}
                    onClick={() => toggleJobTitleKeyword(keyword)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                      filters.jobTitleKeywords.includes(keyword)
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                        filters.jobTitleKeywords.includes(keyword) 
                          ? 'bg-indigo-500 border-indigo-500' 
                          : 'border-gray-300'
                      }`}>
                        {filters.jobTitleKeywords.includes(keyword) && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className="capitalize">{keyword}</span>
                    </span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{count}</span>
                  </button>
                ))}
                {jobTitleKeywordsWithCounts.length > 10 && (
                  <button
                    onClick={() => setShowAllJobTitleKeywords(!showAllJobTitleKeywords)}
                    className="w-full text-xs text-blue-600 hover:text-blue-800 py-2 text-center"
                  >
                    {showAllJobTitleKeywords ? 'Show less' : `Show all (${jobTitleKeywordsWithCounts.length})`}
                  </button>
                )}
              </div>
            </div>
          )}
        </FilterSection>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">
            Showing <span className="font-medium text-gray-700">{filteredCount}</span> of {totalCount}
          </span>
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={onClearAll}
            className="w-full py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear All Filters
          </button>
        )}
      </div>
    </div>
  );
}

