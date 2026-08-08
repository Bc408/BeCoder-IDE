/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum SurveyQuestionType {
	Segment = 'segment',
	Radio = 'radio',
}

export interface ISurveyOption {
	readonly id: string;
	readonly label: string;
}

interface ISurveyQuestionBase {
	readonly id: string;
	readonly label: string;
	readonly options: readonly ISurveyOption[];
	/** When true, the question must be answered before submission. */
	readonly required?: boolean;
	/**
	 * The telemetry field name this answer maps to in the `survey/submit` event.
	 * When set, the selected option ID (or numeric index if {@link asMeasurement} is true) is emitted under this key.
	 */
	readonly telemetryKey?: string;
	/** When true, the answer is logged as a numeric index into the options array (0-based) with `isMeasurement`. */
	readonly asMeasurement?: boolean;
}

export interface ISurveySegmentQuestion extends ISurveyQuestionBase {
	readonly type: SurveyQuestionType.Segment;
}

export interface ISurveyRadioQuestion extends ISurveyQuestionBase {
	readonly type: SurveyQuestionType.Radio;
	readonly columns?: number;
}

export type ISurveyQuestion = ISurveySegmentQuestion | ISurveyRadioQuestion;

export interface ISurveyDefinition {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly questions: readonly ISurveyQuestion[];
}
