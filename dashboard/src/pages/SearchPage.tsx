import { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  FileText,
  BookOpen,
  MessageSquare,
  TrendingUp,
  X,
} from 'lucide-react';

interface SearchResult {
  id: string;
  type: 'score' | 'announcement' | 'course' | 'subject';
  title: string;
  description: string;
  metadata?: any;
  date?: string;
  score?: number;
}

export default function SearchPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([
    'score',
    'announcement',
    'course',
    'subject',
  ]);
  const [sortBy, setSortBy] = useState<'relevance' | 'date' | 'performance'>('relevance');

  // Mock search data
  const mockData = {
    scores: [
      { id: '1', title: 'Mathematics Final Exam', date: '2024-12-15', score: 87 },
      { id: '2', title: 'Physics Midterm', date: '2024-11-20', score: 78 },
      { id: '3', title: 'Chemistry Quiz', date: '2024-11-10', score: 92 },
    ],
    announcements: [
      { id: '1', title: 'Final Exam Schedule', date: '2024-11-01' },
      { id: '2', title: 'Holiday Break Announcement', date: '2024-10-15' },
      { id: '3', title: 'New Library Resources Available', date: '2024-10-20' },
    ],
    courses: [
      { id: '1', title: 'Advanced Mathematics', code: 'MATH-301' },
      { id: '2', title: 'Physics II', code: 'PHYS-102' },
      { id: '3', title: 'Computer Science Basics', code: 'CS-101' },
    ],
    subjects: [
      { id: '1', title: 'Calculus', courses: ['MATH-301', 'MATH-401'] },
      { id: '2', title: 'Linear Algebra', courses: ['MATH-201'] },
      { id: '3', title: 'Quantum Mechanics', courses: ['PHYS-401'] },
    ],
  };

  const performSearch = (term: string) => {
    if (!term.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);

    // Simulate search delay
    setTimeout(() => {
      const searchResults: SearchResult[] = [];
      const lowerTerm = term.toLowerCase();

      // Search scores
      if (selectedFilters.includes('score')) {
        mockData.scores.forEach((score) => {
          if (score.title.toLowerCase().includes(lowerTerm)) {
            searchResults.push({
              id: `score-${score.id}`,
              type: 'score',
              title: score.title,
              description: `Assessment Score: ${score.score}%`,
              date: score.date,
              score: score.score,
            });
          }
        });
      }

      // Search announcements
      if (selectedFilters.includes('announcement')) {
        mockData.announcements.forEach((ann) => {
          if (ann.title.toLowerCase().includes(lowerTerm)) {
            searchResults.push({
              id: `ann-${ann.id}`,
              type: 'announcement',
              title: ann.title,
              description: 'Latest announcement',
              date: ann.date,
            });
          }
        });
      }

      // Search courses
      if (selectedFilters.includes('course')) {
        mockData.courses.forEach((course) => {
          if (
            course.title.toLowerCase().includes(lowerTerm) ||
            course.code.toLowerCase().includes(lowerTerm)
          ) {
            searchResults.push({
              id: `course-${course.id}`,
              type: 'course',
              title: course.title,
              description: `Course Code: ${course.code}`,
            });
          }
        });
      }

      // Search subjects
      if (selectedFilters.includes('subject')) {
        mockData.subjects.forEach((subject) => {
          if (subject.title.toLowerCase().includes(lowerTerm)) {
            searchResults.push({
              id: `subject-${subject.id}`,
              type: 'subject',
              title: subject.title,
              description: `Offered in: ${subject.courses.join(', ')}`,
            });
          }
        });
      }

      // Sort results
      if (sortBy === 'date') {
        searchResults.sort(
          (a, b) =>
            new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
        );
      } else if (sortBy === 'performance') {
        searchResults.sort((a, b) => (b.score || 0) - (a.score || 0));
      }

      setResults(searchResults);
      setLoading(false);
    }, 500);
  };

  useEffect(() => {
    performSearch(searchTerm);
  }, [selectedFilters, sortBy]);

  const toggleFilter = (filter: string) => {
    setSelectedFilters((prev) =>
      prev.includes(filter)
        ? prev.filter((f) => f !== filter)
        : [...prev, filter]
    );
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'score':
        return <TrendingUp size={20} className="text-blue-500" />;
      case 'announcement':
        return <MessageSquare size={20} className="text-purple-500" />;
      case 'course':
        return <BookOpen size={20} className="text-green-500" />;
      case 'subject':
        return <FileText size={20} className="text-orange-500" />;
      default:
        return null;
    }
  };

  const getTypeBadge = (type: string) => {
    const badges = {
      score: { bg: 'bg-blue-100', text: 'text-blue-800' },
      announcement: { bg: 'bg-purple-100', text: 'text-purple-800' },
      course: { bg: 'bg-green-100', text: 'text-green-800' },
      subject: { bg: 'bg-orange-100', text: 'text-orange-800' },
    };
    const badge = badges[type as keyof typeof badges] || {};
    return `${badge.bg} ${badge.text}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-2 mb-2">
            <Search size={32} className="text-blue-500" />
            Search
          </h1>
          <p className="text-gray-600">
            Search across your scores, courses, announcements, and more
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative mb-8">
          <div className="relative">
            <Search
              size={20}
              className="absolute left-4 top-4 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search scores, courses, announcements..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                performSearch(e.target.value);
              }}
              className="w-full pl-12 pr-4 py-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-lg"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setResults([]);
                }}
                className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        {/* Filters & Sort */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Filter by Type */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Filter size={16} />
                Filter by Type
              </h3>
              <div className="space-y-2">
                {['score', 'announcement', 'course', 'subject'].map((filter) => (
                  <label
                    key={filter}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedFilters.includes(filter)}
                      onChange={() => toggleFilter(filter)}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-gray-700 capitalize">{filter}s</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Sort By
              </h3>
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as 'relevance' | 'date' | 'performance')
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="relevance">Relevance</option>
                <option value="date">Most Recent</option>
                <option value="performance">Performance Score</option>
              </select>
            </div>
          </div>
        </div>

        {/* Results */}
        {searchTerm === '' ? (
          // Empty state
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Search size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">Start typing to search</p>
            <p className="text-gray-400 mt-2">
              Search for scores, courses, announcements, and subjects
            </p>
          </div>
        ) : loading ? (
          // Loading state
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
        ) : results.length === 0 ? (
          // No results
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Search size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">No results found</p>
            <p className="text-gray-400 mt-2">
              Try adjusting your search terms or filters
            </p>
          </div>
        ) : (
          // Results list
          <div className="space-y-4">
            <p className="text-gray-600 text-sm font-medium">
              Found {results.length} result{results.length !== 1 ? 's' : ''}
            </p>
            {results.map((result) => (
              <div
                key={result.id}
                className="bg-white rounded-lg shadow-md hover:shadow-lg transition p-6"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-1">
                    {getTypeIcon(result.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {result.title}
                      </h3>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${getTypeBadge(result.type)}`}
                      >
                        {result.type}
                      </span>
                    </div>
                    <p className="text-gray-600 text-sm mb-2">
                      {result.description}
                    </p>
                    {result.date && (
                      <p className="text-gray-500 text-xs">
                        {new Date(result.date).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  {/* Score Badge */}
                  {result.score !== undefined && (
                    <div className="flex-shrink-0">
                      <div className="text-right">
                        <p className="text-2xl font-bold text-blue-600">
                          {result.score}%
                        </p>
                        <p className="text-xs text-gray-600">Score</p>
                      </div>
                    </div>
                  )}

                  {/* Action Button */}
                  <button className="flex-shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium">
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Links */}
        {searchTerm === '' && (
          <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-4">
            <button className="p-4 bg-white rounded-lg shadow hover:shadow-md transition text-center">
              <TrendingUp size={24} className="mx-auto mb-2 text-blue-500" />
              <p className="font-medium text-gray-900">Recent Scores</p>
            </button>
            <button className="p-4 bg-white rounded-lg shadow hover:shadow-md transition text-center">
              <BookOpen size={24} className="mx-auto mb-2 text-green-500" />
              <p className="font-medium text-gray-900">My Courses</p>
            </button>
            <button className="p-4 bg-white rounded-lg shadow hover:shadow-md transition text-center">
              <MessageSquare size={24} className="mx-auto mb-2 text-purple-500" />
              <p className="font-medium text-gray-900">Announcements</p>
            </button>
            <button className="p-4 bg-white rounded-lg shadow hover:shadow-md transition text-center">
              <FileText size={24} className="mx-auto mb-2 text-orange-500" />
              <p className="font-medium text-gray-900">Subjects</p>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
