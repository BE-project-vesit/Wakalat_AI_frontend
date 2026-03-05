// API Service Layer - Handles all backend communication
// Toggle MOCK_MODE to switch between mock and real API

import type { CaseInput, CaseAnalysisResponse, ApiResponse, RelatedCaseLaw, LegalAction } from '@/types/api';

// Configuration
const MOCK_MODE = false; // Set to false when backend is ready
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

// Mock delay to simulate network latency
const MOCK_DELAY = 1500; // ms

// Helper function for mock delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock data generator
function generateMockResponse(_input: CaseInput): CaseAnalysisResponse {
  const caseId = `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Mock related case laws with relevancy scores
  const mockCaseLaws: RelatedCaseLaw[] = [
    {
      id: 'case_1',
      title: 'State of Maharashtra v. Ravi Kumar',
      citation: '2023 SCC 145',
      court: 'Supreme Court of India',
      year: 2023,
      relevancyScore: 95,
      summary: 'This case dealt with robbery charges under IPC Section 392. The court held that use of weapons during robbery constitutes aggravated offense.',
      keyPoints: [
        'Use of weapon increases severity',
        'Eyewitness testimony is crucial',
        'CCTV footage can be primary evidence'
      ],
      url: '#'
    },
    {
      id: 'case_2',
      title: 'Ramesh Sharma v. State of Delhi',
      citation: '2022 Delhi HC 892',
      court: 'Delhi High Court',
      year: 2022,
      relevancyScore: 88,
      summary: 'Case involving theft with violence. Court emphasized the importance of proper documentation and chain of custody for recovered items.',
      keyPoints: [
        'Proper evidence handling required',
        'Recovery memo must be properly executed',
        'Independent witnesses strengthen case'
      ],
      url: '#'
    },
    {
      id: 'case_3',
      title: 'State of UP v. Kamal Singh',
      citation: '2021 Allahabad HC 234',
      court: 'Allahabad High Court',
      year: 2021,
      relevancyScore: 82,
      summary: 'Dealt with admissibility of electronic evidence including CCTV footage in criminal proceedings.',
      keyPoints: [
        'Digital evidence admissibility',
        'Certificate under Section 65B required',
        'Expert testimony may be needed'
      ],
      url: '#'
    }
  ];

  // Mock legal actions
  const mockLegalActions: LegalAction[] = [
    {
      id: 'action_1',
      action: 'File FIR under IPC Section 392 (Robbery)',
      description: 'Register First Information Report for robbery with violence. Since weapon was used, this falls under aggravated robbery.',
      applicableSections: ['IPC Section 392', 'IPC Section 397'],
      priority: 'high',
      estimatedTimeline: '24-48 hours',
      requiredDocuments: ['Identity proof', 'Address proof', 'List of stolen items', 'Medical certificate if injured']
    },
    {
      id: 'action_2',
      action: 'Preserve and Submit Evidence',
      description: 'Secure CCTV footage, witness statements, and recovered items. Ensure proper chain of custody.',
      applicableSections: ['Evidence Act Section 65B', 'Evidence Act Section 3'],
      priority: 'high',
      estimatedTimeline: '48-72 hours',
      requiredDocuments: ['CCTV footage with certificate', 'Witness statements', 'Recovery memo']
    },
    {
      id: 'action_3',
      action: 'Apply for Victim Compensation',
      description: 'File application for compensation under relevant victim compensation scheme.',
      applicableSections: ['Section 357A CrPC'],
      priority: 'medium',
      estimatedTimeline: '1-2 weeks',
      requiredDocuments: ['FIR copy', 'Loss assessment', 'Bank details']
    }
  ];

  return {
    caseId,
    status: 'completed',
    timestamp: new Date().toISOString(),
    relatedCaseLaws: mockCaseLaws,
    legalActions: mockLegalActions,
    applicableLaws: [
      {
        section: 'Section 392',
        act: 'Indian Penal Code, 1860',
        description: 'Punishment for robbery - imprisonment up to 10 years and fine'
      },
      {
        section: 'Section 397',
        act: 'Indian Penal Code, 1860',
        description: 'Robbery with attempt to cause death or grievous hurt'
      },
      {
        section: 'Section 379',
        act: 'Indian Penal Code, 1860',
        description: 'Punishment for theft'
      }
    ],
    summary: 'Based on the case details provided, this appears to be a case of robbery with violence under IPC Section 392. The presence of weapons and witnesses strengthens the case. Immediate action should include filing an FIR, preserving all evidence including CCTV footage, and documenting witness statements. Related case precedents suggest that proper evidence handling and timely action are crucial for successful prosecution.',
    confidence: 87,
    processingTime: MOCK_DELAY
  };
}

// API Functions

/**
 * Analyze case and get related case laws and legal actions
 * @param input - Case details from user
 * @returns Analysis response with case laws and recommended actions
 */
export async function analyzeCase(input: CaseInput): Promise<ApiResponse<CaseAnalysisResponse>> {
  try {
    if (MOCK_MODE) {
      // Mock mode - return simulated data
      await delay(MOCK_DELAY);
      const mockResponse = generateMockResponse(input);
      
      return {
        success: true,
        data: mockResponse
      };
    } else {
      // Real API mode - call actual backend
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const data: CaseAnalysisResponse = await response.json();
      
      return {
        success: true,
        data
      };
    }
  } catch (error) {
    console.error('Error analyzing case:', error);
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'ANALYSIS_ERROR'
      }
    };
  }
}

/**
 * Get details of a specific case law
 * @param caseId - ID of the case law
 */
export async function getCaseLawDetails(caseId: string): Promise<ApiResponse<RelatedCaseLaw>> {
  try {
    if (MOCK_MODE) {
      await delay(500);
      // Return mock data
      return {
        success: true,
        data: {
          id: caseId,
          title: 'Mock Case Law',
          citation: '2023 SCC 123',
          court: 'Supreme Court',
          year: 2023,
          relevancyScore: 90,
          summary: 'Detailed case law information...',
          keyPoints: ['Point 1', 'Point 2'],
          judgmentText: 'Full judgment text would be here...'
        }
      };
    } else {
      const response = await fetch(`${API_BASE_URL}/caselaw/${caseId}`);
      const data = await response.json();
      return { success: true, data };
    }
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to fetch case law',
        code: 'FETCH_ERROR'
      }
    };
  }
}

/**
 * Export case analysis as PDF
 * @param caseId - ID of the analyzed case
 */
export async function exportCaseAnalysis(caseId: string): Promise<ApiResponse<{ url: string }>> {
  try {
    if (MOCK_MODE) {
      await delay(1000);
      return {
        success: true,
        data: { url: '#mock-pdf-url' }
      };
    } else {
      const response = await fetch(`${API_BASE_URL}/export/${caseId}`);
      const data = await response.json();
      return { success: true, data };
    }
  } catch (_error) {
    return {
      success: false,
      error: {
        message: 'Failed to export analysis',
        code: 'EXPORT_ERROR'
      }
    };
  }
}

// Export configuration for easy toggling
export const apiConfig = {
  mockMode: MOCK_MODE,
  baseUrl: API_BASE_URL
};
