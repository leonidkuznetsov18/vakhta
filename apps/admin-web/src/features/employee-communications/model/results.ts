import type { CommunicationDetail } from '@vakhta/contracts';
/** Denominators include submitted respondents who answered this question, never partial drafts. */
export function choiceResults(detail: CommunicationDetail) {
  return (
    detail.questionnaire?.questions.flatMap((question) => {
      if (question.kind === 'TEXT') return [];
      const answers = detail.recipients.flatMap((person) => {
        const answer = person.answers[question.id];
        return person.submittedAt && answer?.kind === 'CHOICE' && answer.optionIds.length
          ? [answer]
          : [];
      });
      return [
        {
          id: question.id,
          prompt: question.prompt,
          multiple: question.kind === 'MULTIPLE_CHOICE',
          total: answers.length,
          options: question.options.map((option) => {
            const count = answers.filter((answer) => answer.optionIds.includes(option.id)).length;
            return {
              ...option,
              count,
              percent: answers.length ? Math.round((count / answers.length) * 100) : 0,
            };
          }),
        },
      ];
    }) ?? []
  );
}
