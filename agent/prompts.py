"""Prompt templates for every LLM-backed node in the workflow.

Kept in one place so tone/format stays consistent across the pipeline and so
node files stay focused on control flow rather than prompt engineering.
"""

from __future__ import annotations

SUBJECT_EXTRACTION_PROMPT = """You are analyzing a course syllabus.

Identify the distinct SUBJECTS covered by the syllabus text below. A subject \
is a top-level area of study (e.g. "Mathematics", "Physics", "Data Structures"). \
For each subject, also capture the exact slice of the syllabus text that \
belongs to it, so downstream steps can extract topics from just that slice.

If the syllabus text is not organized into multiple subjects (e.g. it already \
describes a single course/subject, or has no clear subject headers), return \
exactly ONE subject whose name is your best guess at the course title (or \
"General" if none is apparent) and whose text is the ENTIRE syllabus text \
unmodified. Never return zero subjects unless the input is empty or contains \
no usable content at all.

Syllabus text:
---
{syllabus_text}
---
"""

TOPIC_EXTRACTION_PROMPT = """You are extracting TOPICS from a single subject's \
portion of a syllabus. Topics are the concrete units of study within the \
subject (e.g. for "Data Structures": "Arrays", "Linked Lists", "Trees").

Only use the text below -- do not invent topics that aren't grounded in it.

Subject: {subject_name}
Subject text:
---
{subject_text}
---
"""

TOPIC_EXTENSION_PROMPT = """Break the following TOPIC down into granular \
SUBTOPICS. Every subtopic must remain strictly within the scope of the parent \
topic -- do not introduce unrelated subjects or topics. Aim for 3-8 subtopics \
that a learner would need to master to fully understand the topic.

Topic: {topic_name}
Topic context:
---
{topic_text}
---
"""

TOPIC_GRAPH_PROMPT = """Given the following list of topics/subtopics extracted \
from the same subject, identify meaningful RELATIONSHIPS between them (e.g. \
prerequisite-of, builds-on, related-to, part-of). Only connect items that are \
genuinely related -- an isolated topic with no strong relationships should \
stay unconnected. Assign each relationship a weight from 0.0 (weak) to 1.0 \
(strong). Every item in the list below must appear as a node even if it has \
no edges.

Items:
{topic_list}
"""

QUESTION_GENERATION_PROMPT = """Generate exactly {count} question-and-answer \
pairs to test a learner's understanding of the topic below. Vary difficulty \
(easy/medium/hard) and question style (recall, application, comparison). \
Each reference answer must be self-contained and correct.

Topic: {topic_name}
Topic context:
---
{topic_text}
---
"""

ANSWER_ANALYSIS_PROMPT = """Compare the learner's answer to the reference \
answer for the question below and produce a score in the range -1.0 to 1.0:
- Wrong / contradicts the reference answer -> negative score (closer to -1.0 \
  the more wrong).
- Blank / "I don't know" / off-topic -> score of exactly 0.0.
- Correct / substantively matches the reference answer -> positive score \
  (closer to 1.0 the more complete and precise).
Also give a one-sentence rationale.

Question: {question}
Reference answer: {reference_answer}
Learner's answer: {learner_answer}
"""
