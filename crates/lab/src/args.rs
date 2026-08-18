use fx::Fx;

/// Minimal `--key value` parser.
///
/// Deliberately not a dependency. The lab's whole argument surface is a dozen
/// integers, and this crate is the one that must build and run in CI on any
/// machine at any time.
pub struct Args {
    /// Every bare token, in the order it was typed. `learn-probe train` needs
    /// two of them, and a second `String` field beside `command` would make
    /// "which positional is this" a question about field names rather than about
    /// position.
    positional: Vec<String>,
    pairs: Vec<(String, String)>,
    flags: Vec<String>,
}

impl Args {
    pub fn from_env() -> Args {
        Args::parse(std::env::args().skip(1).collect())
    }

    pub fn parse(tokens: Vec<String>) -> Args {
        let mut positional = Vec::new();
        let mut pairs = Vec::new();
        let mut flags = Vec::new();

        let mut i = 0;
        while i < tokens.len() {
            let token = &tokens[i];
            if let Some(key) = token.strip_prefix("--") {
                match tokens.get(i + 1) {
                    Some(value) if !value.starts_with("--") => {
                        pairs.push((key.to_string(), value.clone()));
                        i += 2;
                    }
                    _ => {
                        flags.push(key.to_string());
                        i += 1;
                    }
                }
            } else {
                positional.push(token.clone());
                i += 1;
            }
        }

        Args {
            positional,
            pairs,
            flags,
        }
    }

    pub fn command(&self) -> &str {
        self.positional.first().map(String::as_str).unwrap_or("")
    }

    /// The second bare token, for the one command that has arms.
    ///
    /// Empty rather than `None` so that a caller can `match` it against its own
    /// arm names and let the wildcard print the usage, which is what every other
    /// unknown token in this parser does.
    pub fn subcommand(&self) -> &str {
        self.positional.get(1).map(String::as_str).unwrap_or("")
    }

    pub fn positionals(&self) -> &[String] { &self.positional }

    pub fn pairs(&self) -> &[(String, String)] { &self.pairs }

    pub fn flags(&self) -> &[String] { &self.flags }

    fn raw(&self, key: &str) -> Option<&str> {
        self.pairs
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_str())
    }

    pub fn flag(&self, key: &str) -> bool {
        self.flags.iter().any(|f| f == key)
    }

    /// A free-form value, for the one thing in this lab that is not a number or
    /// a name out of a fixed list: a file path. Deliberately without the typo
    /// guard [`Args::number`] and [`Args::choice`] carry, because there is no
    /// set of valid paths to check a value against -- a wrong one fails loudly
    /// at the write instead.
    pub fn text(&self, key: &str) -> Option<&str> {
        self.raw(key)
    }

    /// Exits with a clear message rather than silently falling back, because a
    /// typo in `--seeds 100O` that quietly runs the default is the kind of
    /// thing that wastes an afternoon of experiments.
    pub fn number(&self, key: &str, default: u64) -> u64 {
        match self.raw(key) {
            None => default,
            Some(text) => match text.parse::<u64>() {
                Ok(value) => value,
                Err(_) => {
                    eprintln!("--{key} expects a whole number, got '{text}'");
                    std::process::exit(2);
                }
            },
        }
    }

    pub fn usize(&self, key: &str, default: usize) -> usize {
        self.number(key, default as u64) as usize
    }

    pub fn u32(&self, key: &str, default: u32) -> u32 {
        self.number(key, default as u64) as u32
    }

    /// A dimension typed as a decimal, converted to [`Fx`] here and nowhere
    /// else.
    ///
    /// **No floating point exists anywhere on this path, and that is the whole
    /// design.** `"0.35".parse::<f64>()` followed by a multiply is one rounding
    /// mode away from producing a different raw value on a different target, and
    /// this lab's output is compared against a wasm build byte for byte. So the
    /// text is split on `.`, both halves are read as integers, and the answer is
    /// `Fx::from_ratio(numerator, 10^places)` -- the same constructor every
    /// hand-written spec row in `crates/sim` uses. The house pattern for a
    /// runtime fraction elsewhere is an integer-percent key (`--sigma-pct`); a
    /// shield half-width is not naturally a percentage of anything, so this
    /// reads the decimal a person would write instead.
    ///
    /// # It is the constructor that is exact, not the number you typed
    ///
    /// `Fx::from_ratio` truncates toward zero at one raw unit, and a raw unit is
    /// `Fx::EPSILON` = `1/65536` = 0.0000153 (`FRAC_BITS = 16`,
    /// `crates/fx/src/fixed.rs`). Two consequences a caller has to know about,
    /// because neither is visible in the output:
    ///
    /// - **The resolution floor is about 1.5e-5, so distinct decimals are not
    ///   distinct dimensions.** `0.95` and `0.950001` are both raw 62259 and
    ///   therefore the same spec row and the same arena fingerprint;
    ///   `0.9500123` is the first string above `0.95` that is a different one.
    ///   A sweep that steps a length by less than 1.5e-5 is running the same
    ///   fight repeatedly, and only the fingerprint would ever have said so.
    /// - **A value below the floor truncates to zero, and zero is refused
    ///   here.** `validate_equipment` bounds a dimension at `raw() < 0`, so a
    ///   zero-length blade is a *legal* spec row that runs a whole fight and
    ///   loses it. That bound governs the shipped rows and sits upstream of a
    ///   pinned digest, so the refusal belongs to the layer that reads a
    ///   person's typing rather than to the layer that validates the table.
    ///
    /// Nine fractional places at most, because `10^10` does not fit an `i32` and
    /// the tenth place is 1e-10, five orders of magnitude below the floor above
    /// and therefore never the difference between two rows. Exits on a bad parse
    /// for the reason [`Args::number`] does.
    pub fn decimal(&self, key: &str, default: Fx) -> Fx {
        let text = match self.raw(key) {
            None => return default,
            Some(text) => text,
        };
        match parse_decimal(text) {
            Some(value) if value == Fx::ZERO => {
                eprintln!(
                    "--{key} rounds to zero at the 1/65536 fixed-point floor, got '{text}': \
                     a zero-sized item is not a small one, and the spec table would accept it"
                );
                std::process::exit(2);
            }
            Some(value) => value,
            None => {
                eprintln!("--{key} expects a decimal like 0.35, got '{text}'");
                std::process::exit(2);
            }
        }
    }

    /// A named choice out of a fixed list. Exits with the list on a typo, for
    /// the same reason [`Args::number`] does: `--policy duellist` silently
    /// running the default is an afternoon wasted comparing a policy against
    /// itself.
    pub fn choice<T: Copy>(&self, key: &str, default: T, options: &[(&str, T)]) -> T {
        let text = match self.raw(key) {
            None => return default,
            Some(text) => text,
        };
        match options.iter().find(|(name, _)| *name == text) {
            Some((_, value)) => *value,
            None => {
                let names: Vec<&str> = options.iter().map(|(n, _)| *n).collect();
                eprintln!("--{key} expects one of {}, got '{text}'", names.join(", "));
                std::process::exit(2);
            }
        }
    }
}

/// `"1.75"` as an exact ratio, or `None` if it is not a decimal.
///
/// Written out rather than folded into [`Args::decimal`] so it can be tested
/// against the strings a person actually types, including the ones that must be
/// refused: a silently-accepted `"0,35"` is `--sigma-pct 100O` again.
fn parse_decimal(text: &str) -> Option<Fx> {
    let (negative, digits) = match text.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, text),
    };
    let mut parts = digits.split('.');
    let whole = parts.next().unwrap_or("");
    let frac = parts.next().unwrap_or("");
    // A second `.` is a typo and never a thousands separator.
    if parts.next().is_some() || (whole.is_empty() && frac.is_empty()) || frac.len() > 9 {
        return None;
    }
    let mut numerator: i64 = 0;
    for byte in whole.bytes().chain(frac.bytes()) {
        if !byte.is_ascii_digit() {
            return None;
        }
        numerator = numerator.checked_mul(10)?.checked_add((byte - b'0') as i64)?;
    }
    let mut denominator: i64 = 1;
    for _ in 0..frac.len() {
        denominator *= 10;
    }
    let numerator = i32::try_from(if negative { -numerator } else { numerator }).ok()?;
    Some(Fx::from_ratio(numerator, denominator as i32))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(line: &str) -> Args {
        Args::parse(line.split_whitespace().map(String::from).collect())
    }

    #[test]
    fn parses_command_pairs_and_flags() {
        let a = args("embodied --seeds 40 --threads 24 --verbose");
        assert_eq!(a.command(), "embodied");
        assert_eq!(a.number("seeds", 1), 40);
        assert_eq!(a.usize("threads", 1), 24);
        assert!(a.flag("verbose"));
        assert!(!a.flag("quiet"));
        assert_eq!(a.number("missing", 7), 7);
    }

    #[test]
    fn a_choice_resolves_by_name_and_falls_back_when_absent() {
        let options = [("utility", 0u32), ("duelist", 1)];
        let a = args("duel --policy duelist");
        assert_eq!(a.choice("policy", 0, &options), 1);
        assert_eq!(a.choice("opponent", 0, &options), 0);
    }

    #[test]
    fn a_valueless_option_at_the_end_is_a_flag() {
        let a = args("embodied --mirrored");
        assert!(a.flag("mirrored"));
        assert_eq!(a.command(), "embodied");
    }

    #[test]
    fn a_decimal_becomes_the_ratio_a_spec_row_would_have_been_written_as() {
        // Every one of these is a number somebody would type into a picker, and
        // the right-hand side is what the same dimension looks like where it is
        // hand-written in `crates/sim/src/combat/spec.rs`. If the two ever stop
        // agreeing, a configured shield stops being comparable with the shipped
        // one.
        assert_eq!(parse_decimal("0.25"), Some(Fx::from_ratio(1, 4)));
        assert_eq!(parse_decimal("0.95"), Some(Fx::from_ratio(19, 20)));
        assert_eq!(parse_decimal("1.45"), Some(Fx::from_ratio(29, 20)));
        assert_eq!(parse_decimal("2.23"), Some(Fx::from_ratio(223, 100)));
        assert_eq!(parse_decimal("2"), Some(Fx::from_int(2)));
        assert_eq!(parse_decimal("2."), Some(Fx::from_int(2)));
        assert_eq!(parse_decimal(".5"), Some(Fx::HALF));
        assert_eq!(parse_decimal("-0.5"), Some(Fx::ZERO - Fx::HALF));
        // Below one raw unit, so this is the string that used to buy a
        // zero-length blade. `Args::decimal` refuses it; the conversion itself
        // still has to answer, because "what does this text mean" and "may a
        // picker say it" are two questions and only the second is a policy.
        assert_eq!(parse_decimal("0.000000001"), Some(Fx::ZERO), "below one raw unit");

        // Refused rather than partially read. `"0,35"` reading as 0 and running
        // the fixture's dimensions would be an afternoon spent comparing a
        // configuration against itself.
        for bad in ["", ".", "0,35", "1.2.3", "1e3", "0x10", " 1", "1 ", "0.1234567890"] {
            assert_eq!(parse_decimal(bad), None, "'{bad}' was accepted");
        }

        let a = args("trace --a-shield-half-width 0.35");
        assert_eq!(a.decimal("a-shield-half-width", Fx::ONE), Fx::from_ratio(7, 20));
        assert_eq!(a.decimal("b-shield-half-width", Fx::ONE), Fx::ONE, "a default was overwritten");
    }

    #[test]
    fn two_decimals_inside_one_raw_unit_are_the_same_dimension() {
        // The lossy half of `Args::decimal`, pinned so the doc comment above it
        // is a measurement rather than an intuition. A picker sweeping a blade
        // length in steps below 1/65536 is running one fight repeatedly, and
        // nothing downstream -- not the table, not the fight, not the arena
        // fingerprint -- can tell anyone that.
        assert_eq!(parse_decimal("0.95"), parse_decimal("0.950001"));
        assert_eq!(parse_decimal("0.95").map(Fx::raw), Some(62259));
        assert_eq!(
            parse_decimal("0.9500123").map(Fx::raw),
            Some(62260),
            "the first string above 0.95 that is a different row"
        );
    }

    #[test]
    fn a_second_bare_token_is_a_subcommand_and_never_a_value() {
        // The trap this exists to avoid: `--seeds` takes a value, so a parser
        // that recorded the *last* bare token would read `learn-probe evaluate
        // --seeds 200 --mirrored` correctly and `learn-probe evaluate --mirrored
        // 200` as the subcommand `200`. Position, not recency.
        let a = args("learn-probe evaluate --seeds 200 --mirrored");
        assert_eq!(a.command(), "learn-probe");
        assert_eq!(a.subcommand(), "evaluate");
        assert_eq!(a.usize("seeds", 1), 200);
        assert!(a.flag("mirrored"));

        let bare = args("embodied");
        assert_eq!(bare.command(), "embodied");
        assert_eq!(bare.subcommand(), "", "a missing arm is empty, not the command again");
        assert_eq!(args("").command(), "");
    }
}
