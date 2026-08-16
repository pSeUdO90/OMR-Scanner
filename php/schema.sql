CREATE TABLE IF NOT EXISTS app_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(160) DEFAULT '',
  role VARCHAR(20) DEFAULT 'user',
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_sessions (
  token VARCHAR(80) PRIMARY KEY,
  user_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  processed_images_dir VARCHAR(500) DEFAULT '',
  role_permissions_json TEXT,
  logo_path VARCHAR(500) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  roll_no VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  gender VARCHAR(20) DEFAULT '',
  class_name VARCHAR(40) DEFAULT '',
  section VARCHAR(20) DEFAULT '',
  session VARCHAR(40) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  code VARCHAR(20) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS omr_layouts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  total_questions INT NOT NULL,
  options VARCHAR(20) DEFAULT 'ABCD',
  config_json LONGTEXT,
  is_builtin TINYINT(1) DEFAULT 0,
  sample_path VARCHAR(500) DEFAULT '',
  field_map_json TEXT,
  is_finalized TINYINT(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS exams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  exam_date DATE NOT NULL,
  exam_type VARCHAR(80) DEFAULT '',
  duration_minutes INT DEFAULT 180,
  correct_marks DOUBLE DEFAULT 4,
  wrong_marks DOUBLE DEFAULT -1,
  unattempted_marks DOUBLE DEFAULT 0,
  layout_id INT NOT NULL,
  answer_key_json TEXT,
  sample_path VARCHAR(500) DEFAULT '',
  test_id VARCHAR(40) DEFAULT '',
  test_no VARCHAR(40) DEFAULT '',
  class_name VARCHAR(40) DEFAULT '',
  section VARCHAR(200) DEFAULT '',
  batch VARCHAR(40) DEFAULT '',
  field_map_json TEXT,
  grace_marks DOUBLE DEFAULT 0,
  grace_questions_json TEXT,
  status VARCHAR(20) DEFAULT 'draft',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (layout_id) REFERENCES omr_layouts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS exam_subject_maps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL,
  subject_id INT NOT NULL,
  start_q INT NOT NULL,
  end_q INT NOT NULL,
  UNIQUE KEY exam_subject (exam_id, subject_id),
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS exam_sheets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL,
  student_id INT NULL,
  filename VARCHAR(255) DEFAULT '',
  stored_path VARCHAR(500) DEFAULT '',
  status VARCHAR(30) DEFAULT 'uploaded',
  detected_roll VARCHAR(32) DEFAULT '',
  answers_json TEXT,
  error_message TEXT,
  raw_score DOUBLE DEFAULT 0,
  max_score DOUBLE DEFAULT 0,
  right_count INT DEFAULT 0,
  wrong_count INT DEFAULT 0,
  left_count INT DEFAULT 0,
  invalid_count INT DEFAULT 0,
  overlay_path VARCHAR(500) DEFAULT '',
  assigned_manually TINYINT(1) DEFAULT 0,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sheet_question_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sheet_id INT NOT NULL,
  question_no INT NOT NULL,
  subject_id INT NULL,
  marked VARCHAR(8) DEFAULT '',
  correct VARCHAR(8) DEFAULT '',
  rwl CHAR(1) DEFAULT 'L',
  FOREIGN KEY (sheet_id) REFERENCES exam_sheets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
