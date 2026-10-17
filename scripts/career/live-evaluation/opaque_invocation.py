"""Binding adapter for an EXISTING trusted Upmore invocation; not configured here.

The parent must supply/verify the absolute invocation path and its non-secret
attestation. No credentials, shell command, provider SDK, environment lookup,
network request, deployment or persistent service is created by this module.
"""
import copy
import hashlib
import json
from pathlib import Path
import subprocess

from admission import Denied, digest, validate_binding

IDENTITY_FIELDS = ("invocation_id", "host_id", "source_sha", "bounds_micros")


class ExistingUpmoreInvocation:
    def __init__(self, binding, executable, *, mode="live_model"):
        validate_binding(binding)
        self.binding = copy.deepcopy(binding)
        self.executable = Path(executable)
        self.mode = mode
        self.readiness = None
        if not self.executable.is_absolute():
            raise Denied("absolute_existing_invocation_required")
        if not binding.get("opaque_command_sha256"):
            raise Denied("missing_existing_invocation_source_pin")
        self.verify_binding()

    def verify_binding(self):
        # No callback execution and no environment/credential reads in this check.
        if hashlib.sha256(self.executable.read_bytes()).hexdigest() != self.binding["opaque_command_sha256"]:
            raise Denied("existing_invocation_bytes_changed")
        if self.readiness is not None and self.readiness["binding_sha256"] != digest(self.binding):
            raise Denied("readiness_binding_changed")

    def _call(self, request):
        # No shell, credential-bearing arguments, implicit retry or raw stderr.
        completed = subprocess.run([str(self.executable)], input=json.dumps(request),
                                   capture_output=True, text=True, timeout=60, check=False)
        if completed.returncode != 0:
            raise Denied("existing_invocation_failed_full_bound_retained")
        try:
            value = json.loads(completed.stdout)
        except ValueError:
            raise Denied("existing_invocation_invalid_json") from None
        if not isinstance(value, dict):
            raise Denied("existing_invocation_invalid_response")
        return value

    def assert_ready(self):
        self.verify_binding()
        if self.readiness is None:
            raise Denied("read_only_readiness_missing")

    def read_only_readiness(self):
        """Only after parent verifies this pinned command's readiness is zero-cost.

        This method is never called automatically by construction or run_turn.
        It does not authorize installing the gate from a self-asserted response.
        """
        self.verify_binding()
        r = self._call({"operation": "read_only_readiness"})
        if r.get("operation") != "read_only_readiness" or r.get("provider_calls") != 0:
            raise Denied("readiness_not_attested_read_only")
        if r.get("native_text_implemented") is not True or r.get("native_pair_contract") != "native_pair_v1":
            raise Denied("native_text_not_implemented")
        if any(r.get(k) != self.binding[k] for k in IDENTITY_FIELDS):
            raise Denied("configured_invocation_identity_or_full_bound_mismatch")
        self.readiness = {"binding_sha256": digest(self.binding), "response": r}
        return copy.deepcopy(self.readiness)

    def invoke_upmore(self, body, ticket):
        self.assert_ready()
        if set(body) != {"message", "thread_id", "turn_key"} or digest(body) != ticket["request_sha256"]:
            raise Denied("native_request_or_admission_mismatch")
        if ticket["binding_sha256"] != digest(self.binding):
            raise Denied("native_invocation_binding_mismatch")
        return self._call({"operation": "invoke_actual_upmore", "body": body, "admission": ticket})
