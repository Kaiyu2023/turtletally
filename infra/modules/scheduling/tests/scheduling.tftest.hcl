mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  name_prefix   = "turtle-tally-test"
  function_arn  = "arn:aws:lambda:eu-west-2:000000000000:function:turtle-tally-test-scheduler-worker"
  function_name = "turtle-tally-test-scheduler-worker"
}

run "the_worker_runs_on_the_owners_clock" {
  command = plan

  assert {
    condition     = aws_scheduler_schedule.due_schedules.schedule_expression_timezone == "Europe/London"
    error_message = "A due date is a date the owner sees, so the trigger reads the same clock."
  }

  assert {
    condition     = one(aws_scheduler_schedule.due_schedules.flexible_time_window[*].mode) == "OFF"
    error_message = "A ledger entry dated by its occurrence should not drift into another day."
  }
}

run "a_failed_run_is_retried_briefly_rather_than_queued" {
  command = plan

  assert {
    condition = alltrue([
      for target in aws_scheduler_schedule.due_schedules.target :
      one(target.retry_policy[*].maximum_event_age_in_seconds) <= 3600
    ])
    error_message = "The next day's run is the real recovery, so nothing waits longer than an hour."
  }
}
