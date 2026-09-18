# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


class AgentBounty(gl.Contract):
    creators: DynArray[Address]
    eligible_workers: DynArray[Address]
    workers: DynArray[Address]

    titles: DynArray[str]
    requirements: DynArray[str]
    submission_urls: DynArray[str]

    amounts: DynArray[u256]
    statuses: DynArray[str]
    scores: DynArray[u32]
    verdicts: DynArray[str]
    explanations: DynArray[str]

    def __init__(self):
        pass

    @gl.public.write.payable
    def create_bounty(
        self,
        title: str,
        requirements: str,
        eligible_worker: str
    ) -> u32:
        amount = gl.message.value

        if amount == u256(0):
            raise gl.vm.UserError("Bounty must contain GEN")

        worker = Address(eligible_worker)

        if worker == Address(
            "0x0000000000000000000000000000000000000000"
        ):
            raise gl.vm.UserError("Eligible worker is required")

        bounty_id = u32(len(self.titles))

        self.creators.append(
            gl.message.sender_address
        )

        self.eligible_workers.append(worker)

        self.workers.append(
            Address(
                "0x0000000000000000000000000000000000000000"
            )
        )

        self.titles.append(title)
        self.requirements.append(requirements)
        self.submission_urls.append("")
        self.amounts.append(amount)
        self.statuses.append("OPEN")
        self.scores.append(u32(0))
        self.verdicts.append("")
        self.explanations.append("")

        return bounty_id

    @gl.public.write
    def submit_work(
        self,
        bounty_id: u32,
        submission_url: str
    ) -> None:
        if bounty_id >= u32(len(self.titles)):
            raise gl.vm.UserError("Bounty does not exist")

        if self.statuses[bounty_id] != "OPEN":
            raise gl.vm.UserError("Bounty is not open")

        if gl.message.sender_address != self.eligible_workers[bounty_id]:
            raise gl.vm.UserError("Caller is not the eligible worker")

        if submission_url == "":
            raise gl.vm.UserError("Submission URL is required")

        self.workers[bounty_id] = (
            gl.message.sender_address
        )

        self.submission_urls[bounty_id] = submission_url
        self.statuses[bounty_id] = "SUBMITTED"

    @gl.public.write
    def evaluate_submission(
        self,
        bounty_id: u32
    ) -> None:
        if bounty_id >= u32(len(self.titles)):
            raise gl.vm.UserError("Bounty does not exist")

        if self.statuses[bounty_id] != "SUBMITTED":
            raise gl.vm.UserError("Work has not been submitted")

        title = self.titles[bounty_id]
        requirements = self.requirements[bounty_id]
        submission_url = self.submission_urls[bounty_id]

        worker = self.workers[bounty_id]
        eligible_worker = self.eligible_workers[bounty_id]

        if worker != eligible_worker:
            raise gl.vm.UserError("Worker binding mismatch")

        if worker == Address(
            "0x0000000000000000000000000000000000000000"
        ):
            raise gl.vm.UserError("Worker is not bound")

        def evaluate():
            response = gl.nondet.web.get(submission_url)
            content = response.body.decode("utf-8")

            content = content[:12000]

            prompt = f"""
You are evaluating a bounty submission.

BOUNTY TITLE:
{title}

REQUIREMENTS:
{requirements}

SUBMISSION URL:
{submission_url}

SUBMISSION CONTENT:
{content}

Evaluate whether the submitted work satisfies the requirements.

Return ONLY valid JSON:

{{
  "verdict": "PASS" or "PARTIAL" or "FAIL",
  "score": integer from 0 to 100,
  "explanation": "short explanation"
}}

Scoring rules:

PASS:
The submission satisfies the important requirements.

PARTIAL:
The submission satisfies some important requirements but misses or
fails others.

FAIL:
The submission does not satisfy the core requirements.

The score must reflect how well the submission satisfies the stated
requirements. Do not invent requirements that were not provided.
"""

            result = gl.nondet.exec_prompt(prompt)

            result = result.replace("```json", "")
            result = result.replace("```", "")
            result = result.strip()

            data = json.loads(result)

            verdict = str(data["verdict"]).upper()
            score = int(data["score"])
            explanation = str(data["explanation"])

            if verdict not in [
                "PASS",
                "PARTIAL",
                "FAIL"
            ]:
                raise gl.vm.UserError("Invalid verdict")

            if score < 0 or score > 100:
                raise gl.vm.UserError("Invalid score")

            return {
                "verdict": verdict,
                "score": score,
                "explanation": explanation
            }

        def leader_fn():
            return evaluate()

        def validator_fn(leader_result):
            if not isinstance(
                leader_result,
                gl.vm.Return
            ):
                return False

            leader_data = leader_result.calldata

            try:
                validator_data = evaluate()
            except Exception:
                return False

            if (
                leader_data["verdict"]
                != validator_data["verdict"]
            ):
                return False

            if abs(
                int(leader_data["score"])
                - int(validator_data["score"])
            ) > 15:
                return False

            return True

        result = gl.vm.run_nondet_unsafe(
            leader_fn,
            validator_fn
        )

        self.scores[bounty_id] = u32(
            result["score"]
        )

        self.verdicts[bounty_id] = (
            result["verdict"]
        )

        self.explanations[bounty_id] = (
            result["explanation"]
        )

        if result["verdict"] == "PASS":
            self.statuses[bounty_id] = "PAID"

            amount = self.amounts[bounty_id]
            payout_worker = self.eligible_workers[bounty_id]

            _Recipient(payout_worker).emit_transfer(
                value=amount
            )

        elif result["verdict"] == "FAIL":
            self.statuses[bounty_id] = "REFUNDED"

            amount = self.amounts[bounty_id]
            creator = self.creators[bounty_id]

            _Recipient(creator).emit_transfer(
                value=amount
            )

        else:
            self.statuses[bounty_id] = "PARTIAL"

    @gl.public.write
    def settle_partial(
        self,
        bounty_id: u32
    ) -> None:
        if bounty_id >= u32(len(self.titles)):
            raise gl.vm.UserError("Bounty does not exist")

        if self.statuses[bounty_id] != "PARTIAL":
            raise gl.vm.UserError(
                "Bounty is not awaiting partial settlement"
            )

        worker = self.eligible_workers[bounty_id]
        creator = self.creators[bounty_id]
        amount = self.amounts[bounty_id]

        if worker == Address(
            "0x0000000000000000000000000000000000000000"
        ):
            raise gl.vm.UserError("Worker is not bound")

        if self.workers[bounty_id] != worker:
            raise gl.vm.UserError(
                "Submitted worker does not match payout worker"
            )

        worker_amount = amount // u256(2)
        creator_amount = amount - worker_amount

        self.statuses[bounty_id] = "PARTIAL_SETTLED"

        if worker_amount > u256(0):
            _Recipient(worker).emit_transfer(
                value=worker_amount
            )

        if creator_amount > u256(0):
            _Recipient(creator).emit_transfer(
                value=creator_amount
            )

    @gl.public.view
    def get_bounty(
        self,
        bounty_id: u32
    ):
        if bounty_id >= u32(len(self.titles)):
            raise gl.vm.UserError("Bounty does not exist")

        return {
            "id": bounty_id,
            "creator": str(
                self.creators[bounty_id]
            ),
            "eligible_worker": str(
                self.eligible_workers[bounty_id]
            ),
            "worker": str(
                self.workers[bounty_id]
            ),
            "title": self.titles[bounty_id],
            "requirements": self.requirements[bounty_id],
            "submission_url": self.submission_urls[bounty_id],
            "amount": self.amounts[bounty_id],
            "status": self.statuses[bounty_id],
            "score": self.scores[bounty_id],
            "verdict": self.verdicts[bounty_id],
            "explanation": self.explanations[bounty_id]
        }

    @gl.public.view
    def get_bounty_count(self) -> u32:
        return u32(len(self.titles))

    @gl.public.view
    def get_explanation(
        self,
        bounty_id: u32
    ) -> str:
        return self.explanations[bounty_id]

    @gl.public.view
    def get_score(
        self,
        bounty_id: u32
    ) -> u32:
        return self.scores[bounty_id]

    @gl.public.view
    def get_status(
        self,
        bounty_id: u32
    ) -> str:
        return self.statuses[bounty_id]
