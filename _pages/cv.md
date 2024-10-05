---
layout: archive
title: "CV"
permalink: /cv/
author_profile: true
redirect_from:
  - /resume
---

{% include base_path %}

<object data="../files/2024_Clark Peng_CV.pdf" type="application/pdf" width="700px" height="700px">
    <embed src="../files/2024_Clark Peng_CV.pdf">
        <p>This browser does not support PDFs. Please download the PDF to view it: <a ref="../files/2024_Clark Peng_CV.pdf">Download PDF</a>.</p>
    </embed>
</object>

Education
======
* B.S.E in Computer Science, University of California Los Angeles, 2028 (expected)

Work experience
======
* Summer 2024: Teaching Assistant and Curriculum Improvement
  * MIT Beaver Works Summer Institute
  * Duties included: implementing Proximal Policy Optimization for a game codebase, preparing and conducting lectures for intros to CNNs and RL methods, improving Unity game generation code.
  * Supervisor: Dr. Rob Seater

Research experience
======
* Summer 2023 & 2024: Student Researcher
  * University of Nevada Reno
  * Duties included: enhancing DETR object detection performance with hyperparameter tuning; refactoring code to support weakly-supervised DETR; preparing a new dataset and automating data transformation in Python.
  * Supervisor: Dr. Lei Yang
  
Skills
======
* Unity
* Python
  * Tensorflow
  * Pytorch
  * Numpy
  * Transformers
  * Regex
  * Scikit Learn
* C++ 
* C#

Publications
======
  <ul>{% for post in site.publications reversed %}
    {% include archive-single-cv.html %}
  {% endfor %}</ul>
  
<!-- Talks
======
  <ul>{% for post in site.talks reversed %}
    {% include archive-single-talk-cv.html  %}
  {% endfor %}</ul>
  
Teaching
======
  <ul>{% for post in site.teaching reversed %}
    {% include archive-single-cv.html %}
  {% endfor %}</ul>
  
Service and leadership
======
* Currently signed in to 43 different slack teams -->
